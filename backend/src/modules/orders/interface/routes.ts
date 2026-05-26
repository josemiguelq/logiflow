import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderStatus, canTransition } from '../domain/entities'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgOrderRepo } from '../infrastructure/repositories/pg-order-repo'
import { createPgRouteRepo } from '../../routes/infrastructure/repositories/pg-route-repo'
import { generateCode } from '../../../shared/utils/code-generator'
import { createOrder } from '../application/use-cases/create-order'
import { assignDeliverer } from '../application/use-cases/assign-deliverer'
import { confirmPickup } from '../application/use-cases/confirm-pickup'
import { confirmDelivery } from '../application/use-cases/confirm-delivery'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'
import { redis } from '../../../shared/infra/redis'
import { uploadBase64, resolveImageUrl } from '../../../shared/storage/client'
import { assertCanCreateOrder } from '../../../shared/billing'

const queueNotif = (storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('status_changed', { type: 'whatsapp', storeId, orderId, statusEvent })
    .catch(() => { /* non-fatal */ })

const STORE_ORDERS_TTL     = 30  // seconds
const DELIVERER_ORDERS_TTL = 15  // seconds

function storeOrdersCacheKey(storeId: string, userId: string, q: Record<string, string>) {
  const { status = '', delivererId = '', page = '1', limit = '50' } = q
  return `orders:store:${storeId}:${userId}:${status}:${delivererId}:${page}:${limit}`
}

async function invalidateStoreOrders(storeId: string) {
  try {
    const keys = await redis.keys(`orders:store:${storeId}:*`)
    if (keys.length > 0) await redis.del(...(keys as [string, ...string[]]))
  } catch { /* non-fatal */ }
}

async function invalidateDelivererOrders(delivererId: string) {
  try { await redis.del(`orders:deliverer:${delivererId}`) } catch { /* non-fatal */ }
}

async function signOrderProof<T extends { proof?: { photoUrl: string; lat?: number; lng?: number } | undefined }>(
  order: T
): Promise<T> {
  if (!order.proof) return order
  const signedUrl = await resolveImageUrl(order.proof.photoUrl)
  return { ...order, proof: { ...order.proof, photoUrl: signedUrl ?? order.proof.photoUrl } }
}

async function signOrdersProof<T extends { proof?: { photoUrl: string; lat?: number; lng?: number } | undefined }>(
  orders: T[]
): Promise<T[]> {
  return Promise.all(orders.map(signOrderProof))
}

export async function orderRoutes(app: FastifyInstance) {
  const orderRepo = createPgOrderRepo(db)
  const routeRepo = createPgRouteRepo(db)

  // ── Public tracking (no auth) ────────────────────────────────────────────
  app.get('/tracking/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string }

    // Authenticated users (JWT present and valid) always bypass expiry
    let isAuthenticated = false
    try {
      await req.jwtVerify()
      isAuthenticated = true
    } catch { /* public access — ok */ }

    const order = await orderRepo.getPublic(orderId)
    if (!order) return reply.code(404).send({ error: 'Not found' })

    // Expire link 15 min after final status for unauthenticated access
    if (!isAuthenticated && (order.status === 'DELIVERED' || order.status === 'CANCELLED')) {
      const { rows: [ts] } = await db.query(
        `SELECT COALESCE(delivered_at, created_at) AS final_at FROM orders WHERE id = $1`,
        [orderId]
      )
      const finalAt = ts?.final_at as Date | null
      if (finalAt && Date.now() - new Date(finalAt).getTime() > 15 * 60 * 1000) {
        return reply.code(410).send({ error: 'Tracking link expired' })
      }
    }

    // Attach deliverer's last known live position (from location_history, updated every ~15s)
    let delivererLat: number | null = null
    let delivererLng: number | null = null
    if ((order as { deliverer?: unknown }).deliverer) {
      const { rows } = await db.query(
        `SELECT lat, lng FROM location_history
         WHERE deliverer_id = (SELECT deliverer_id FROM orders WHERE id = $1)
         ORDER BY recorded_at DESC LIMIT 1`,
        [orderId]
      )
      if (rows[0]) {
        delivererLat = (rows[0] as Record<string, unknown>).lat as number
        delivererLng = (rows[0] as Record<string, unknown>).lng as number
      }
    }

    // Compute whether customer ratings are enabled for this store + fetch store theme
    const { rows: [storeRow] } = await db.query(
      'SELECT id, store_id FROM orders WHERE id = $1',
      [orderId]
    )
    const storeId = (storeRow as Record<string, unknown> | undefined)?.store_id as string | undefined

    const { rows: [ratingCfg] } = await db.query(`
      SELECT
        COALESCE(
          (SELECT ssv.value = 'true'
           FROM settings s JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = o.store_id
           WHERE s.name = 'allow_customer_ratings'),
          false
        ) AS allow,
        EXISTS (
          SELECT 1 FROM store_features_enabled sfe
          JOIN features f ON f.id = sfe.feature_id
          WHERE sfe.store_id = o.store_id AND f.name = 'customer_ratings'
        ) AS feature_on
      FROM orders o
      WHERE o.id = $1
    `, [orderId])
    const ratingEnabled = Boolean(
      (ratingCfg as Record<string, unknown> | undefined)?.allow &&
      (ratingCfg as Record<string, unknown> | undefined)?.feature_on
    )

    // Fetch store theme (try Redis cache first)
    let storeTheme: {
      primary: string; secondary: string; accent: string;
      logoUrl: string | null; storeName: string | null
    } | null = null

    if (storeId) {
      try {
        const cached = await redis.get(`theme:store:${storeId}`)
        if (cached) {
          const parsed = JSON.parse(cached)
          const t = parsed.theme
          if (parsed.features?.customThemeEnabled && t) {
            storeTheme = {
              primary:   t.primary   ?? '#2563EB',
              secondary: t.secondary ?? '#F9FAFB',
              accent:    t.accent    ?? '#F97316',
              logoUrl:   await resolveImageUrl((t.logoPath ?? t.logoUrl) as string | null) ?? null,
              storeName: (parsed.storeName ?? t.storeName) as string | null ?? null,
            }
          }
        }
      } catch { /* Redis unavailable */ }

      if (!storeTheme) {
        const { rows: featureRows } = await db.query(`
          SELECT f.name FROM store_features_enabled sfe
          JOIN features f ON f.id = sfe.feature_id
          WHERE sfe.store_id = $1 AND f.name = 'custom_theme'
        `, [storeId])
        if (featureRows.length > 0) {
          const [{ rows: [themeRow] }, { rows: [nameRow] }] = await Promise.all([
            db.query(
              'SELECT primary_color, secondary_color, accent_color, logo_url FROM store_theme WHERE store_id = $1',
              [storeId]
            ),
            db.query('SELECT name FROM stores WHERE id = $1', [storeId]),
          ])
          storeTheme = {
            primary:   (themeRow as Record<string, unknown> | undefined)?.primary_color   as string ?? '#2563EB',
            secondary: (themeRow as Record<string, unknown> | undefined)?.secondary_color as string ?? '#F9FAFB',
            accent:    (themeRow as Record<string, unknown> | undefined)?.accent_color    as string ?? '#F97316',
            logoUrl:   await resolveImageUrl((themeRow as Record<string, unknown> | undefined)?.logo_url as string | null) ?? null,
            storeName: (nameRow  as Record<string, unknown> | undefined)?.name            as string | null ?? null,
          }
        }
      }
    }

    return { ...order, delivererLat, delivererLng, ratingEnabled, storeTheme }
  })

  // ── Public rating submission ──────────────────────────────────────────────
  app.post('/tracking/:orderId/rating', async (req, reply) => {
    const { orderId } = req.params as { orderId: string }
    const { rating, comment } = z.object({
      rating:  z.number().int().min(1).max(5),
      comment: z.string().max(500).optional(),
    }).parse(req.body)

    // Check feature + store setting
    const { rows: [ratingCfg] } = await db.query(`
      SELECT
        COALESCE(
          (SELECT ssv.value = 'true'
           FROM settings s JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = o.store_id
           WHERE s.name = 'allow_customer_ratings'),
          false
        ) AS allow,
        EXISTS (
          SELECT 1 FROM store_features_enabled sfe
          JOIN features f ON f.id = sfe.feature_id
          WHERE sfe.store_id = o.store_id AND f.name = 'customer_ratings'
        ) AS feature_on
      FROM orders o
      WHERE o.id = $1
    `, [orderId])

    if (!ratingCfg ||
        !(ratingCfg as Record<string, unknown>).allow ||
        !(ratingCfg as Record<string, unknown>).feature_on) {
      return reply.code(403).send({ error: 'Avaliações não habilitadas para esta loja' })
    }

    const { rows: [order] } = await db.query(
      'SELECT status, rating FROM orders WHERE id = $1',
      [orderId]
    )
    if (!order) return reply.code(404).send({ error: 'Not found' })
    if ((order as Record<string, unknown>).status !== 'DELIVERED') {
      return reply.code(409).send({ error: 'Pedido ainda não entregue' })
    }
    if ((order as Record<string, unknown>).rating !== null) {
      return reply.code(409).send({ error: 'Avaliação já registrada' })
    }

    await orderRepo.submitRating(orderId, rating, comment)
    return { ok: true }
  })

  // ── Store user routes ────────────────────────────────────────────────────
  app.get(
    '/orders',
    { preHandler: requireStoreUser },
    async (req) => {
      const query = req.query as Record<string, string>
      const { status, delivererId, page, limit } = query
      const isAssistant = req.actor.type === 'store_user' && req.actor.role === 'ASSISTANT'
      const filters = {
        status:          status as OrderStatus | undefined,
        delivererId,
        createdByUserId: isAssistant ? req.actor.sub : undefined,
        page:            page ? Number(page) : 1,
        limit:           limit ? Number(limit) : 50,
      }

      const cacheKey = storeOrdersCacheKey(req.actor.storeId, req.actor.sub, query)
      try {
        const raw = await redis.get(cacheKey)
        if (raw) return signOrdersProof(JSON.parse(raw))
      } catch { /* fall through to DB */ }

      const orders = await orderRepo.findByStore(req.actor.storeId, filters)
      redis.setex(cacheKey, STORE_ORDERS_TTL, JSON.stringify(orders)).catch(() => {})
      return signOrdersProof(orders)
    }
  )

  app.get(
    '/orders/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order) return reply.code(404).send({ error: 'Not found' })
      return signOrderProof(order)
    }
  )

  const createSchema = z.object({
    customerId:      z.string().uuid(),
    notes:           z.string().optional(),
    paymentMethod:   z.enum(['prepaid', 'cash', 'card']).default('prepaid'),
    cashAmount:      z.number().positive().optional(),
    lat:             z.number().optional(),
    lng:             z.number().optional(),
    deliveryAddress: z.string().optional(),
    deliveryLat:     z.number().optional(),
    deliveryLng:     z.number().optional(),
  })

  app.post(
    '/orders',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      try {
        await assertCanCreateOrder(db, req.actor.storeId)
      } catch (err: unknown) {
        return reply.code(402).send({ error: (err as Error).message })
      }

      const body = createSchema.parse(req.body)
      const actor = req.actor
      const storeId = actor.storeId

      // Delivery code = last 4 digits of customer phone
      const { rows: [cust] } = await db.query(
        'SELECT phone FROM customers WHERE id = $1 AND store_id = $2',
        [body.customerId, storeId]
      )
      const deliveryCode = (cust?.phone as string | undefined)?.slice(-4) ?? generateCode().slice(0, 4)

      const order = await createOrder(
        { storeId, createdByUserId: actor.sub, lat: body.lat, lng: body.lng,
          customerId: body.customerId, notes: body.notes, deliveryCode,
          paymentMethod: body.paymentMethod, cashAmount: body.cashAmount,
          deliveryAddress: body.deliveryAddress, deliveryLat: body.deliveryLat, deliveryLng: body.deliveryLng },
        { orderRepo }
      )

      wsHub.broadcastOrderUpdate(storeId, order)
      queueNotif(storeId, order.id, 'PREPARING')
      invalidateStoreOrders(storeId)
      return reply.code(201).send(order)
    }
  )

  const assignSchema = z.object({
    delivererId:   z.string().uuid(),
    routePosition: z.number().int().min(1).optional(),
  })

  app.patch(
    '/orders/:id/assign',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = assignSchema.parse(req.body)

      // Refuse to assign to an OFFLINE deliverer
      const { rows: [d] } = await db.query(
        'SELECT status FROM deliverers WHERE id = $1 AND store_id = $2',
        [body.delivererId, req.actor.storeId]
      )
      if (!d) return reply.code(404).send({ error: 'Entregador não encontrado' })
      if (d.status === 'OFFLINE') return reply.code(409).send({ error: 'Entregador está OFFLINE e não pode receber pedidos.' })

      let order
      try {
        order = await assignDeliverer(
          { orderId: id, storeId: req.actor.storeId, ...body },
          { orderRepo }
        )
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message })
      }

      // Every assignment creates its own immutable route
      const route = await routeRepo.create({
        storeId:     req.actor.storeId,
        delivererId: body.delivererId,
        pickupCode:  generateCode(),
      })
      await routeRepo.linkOrders(route.id, [order.id])

      wsHub.broadcastOrderUpdate(req.actor.storeId, order)
      queueNotif(req.actor.storeId, order.id, 'ASSIGNED')
      invalidateStoreOrders(req.actor.storeId)
      invalidateDelivererOrders(body.delivererId)
      return { route, order }
    }
  )

  app.patch(
    '/orders/:id/cancel',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order) return reply.code(404).send({ error: 'Not found' })
      const updated = await orderRepo.updateStatus(id, 'CANCELLED')
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      queueNotif(req.actor.storeId, id, 'CANCELLED')
      invalidateStoreOrders(req.actor.storeId)
      if (order.delivererId) invalidateDelivererOrders(order.delivererId as string)

      if (order.routeId) {
        await routeRepo.checkAndFinish(order.routeId, req.actor.storeId)
      }

      return updated
    }
  )

  // Store user edits the note on an existing order
  app.patch(
    '/orders/:id/note',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { note } = z.object({ note: z.string().max(1000) }).parse(req.body)

      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order) return reply.code(404).send({ error: 'Not found' })

      await db.query(
        `UPDATE orders SET notes = $1 WHERE id = $2`,
        [note.trim() || null, id]
      )
      const updated = (await orderRepo.findById(id, req.actor.storeId))!
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      invalidateStoreOrders(req.actor.storeId)
      if (updated.delivererId) invalidateDelivererOrders(updated.delivererId as string)
      return updated
    }
  )

  app.post(
    '/orders/batch-assign',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { orderIds, delivererId } = z.object({
        orderIds:    z.array(z.string().uuid()).min(1),
        delivererId: z.string().uuid(),
      }).parse(req.body)

      const { rows: [d] } = await db.query(
        'SELECT status FROM deliverers WHERE id = $1 AND store_id = $2',
        [delivererId, req.actor.storeId]
      )
      if (!d) return reply.code(404).send({ error: 'Entregador não encontrado' })
      if (d.status === 'OFFLINE') return reply.code(409).send({ error: 'Entregador está OFFLINE e não pode receber pedidos.' })

      const { route, assigned } = await db.transaction(async (client) => {
        const assigned = []
        for (let i = 0; i < orderIds.length; i++) {
          const { rows: [order] } = await client.query(
            `SELECT id, status FROM orders WHERE id = $1 AND store_id = $2`,
            [orderIds[i], req.actor.storeId]
          )
          if (!order) throw Object.assign(new Error(`Pedido ${orderIds[i]} não encontrado`), { statusCode: 404 })
          if (!canTransition(order.status as OrderStatus, 'ASSIGNED')) {
            throw Object.assign(new Error(`Pedido ${orderIds[i]} não pode ser atribuído (status: ${order.status})`), { statusCode: 409 })
          }
          const { rows: [updated] } = await client.query(
            `UPDATE orders SET deliverer_id = $2, route_position = $3, status = 'ASSIGNED'
             WHERE id = $1 RETURNING *`,
            [orderIds[i], delivererId, i + 1]
          )
          assigned.push(await orderRepo.findById(updated.id as string, req.actor.storeId))
        }

        const { rows: [routeRow] } = await client.query(
          `INSERT INTO routes (store_id, deliverer_id, pickup_code) VALUES ($1,$2,$3) RETURNING *`,
          [req.actor.storeId, delivererId, generateCode()]
        )
        await client.query(
          `UPDATE orders SET route_id = $1 WHERE id = ANY($2::uuid[])`,
          [routeRow.id, assigned.map(o => o!.id)]
        )

        return {
          route: { id: routeRow.id as string, storeId: routeRow.store_id as string, delivererId, pickupCode: routeRow.pickup_code as string, status: routeRow.status as string, createdAt: routeRow.created_at as Date },
          assigned: assigned as NonNullable<typeof assigned[0]>[],
        }
      })

      for (const order of assigned) {
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        queueNotif(req.actor.storeId, order.id, 'ASSIGNED')
      }
      invalidateStoreOrders(req.actor.storeId)
      invalidateDelivererOrders(delivererId)

      return { route, orders: assigned }
    }
  )

  // ── Deliverer routes ─────────────────────────────────────────────────────
  app.get(
    '/deliverer/orders',
    { preHandler: requireDeliverer },
    async (req) => {
      const cacheKey = `orders:deliverer:${req.actor.sub}`
      try {
        const raw = await redis.get(cacheKey)
        if (raw) {
          const orders = JSON.parse(raw)
          const signed = await signOrdersProof(orders)
          return signed.map((o: typeof orders[0]) => ({
            ...o,
            customer: { name: o.customer.name, address: o.customer.address, complement: o.customer.complement, lat: o.customer.lat, lng: o.customer.lng },
          }))
        }
      } catch { /* fall through to DB */ }

      const orders = await orderRepo.findByDeliverer(req.actor.sub)
      redis.setex(cacheKey, DELIVERER_ORDERS_TTL, JSON.stringify(orders)).catch(() => {})
      const signed = await signOrdersProof(orders)
      return signed.map(o => ({
        ...o,
        customer: { name: o.customer.name, address: o.customer.address, complement: o.customer.complement, lat: o.customer.lat, lng: o.customer.lng },
      }))
    }
  )

  // PREPARING orders available for any deliverer in this store to claim
  app.get(
    '/deliverer/orders/preparing',
    { preHandler: requireDeliverer },
    async (req) => {
      const orders = await orderRepo.findPreparing(req.actor.storeId, req.actor.sub)
      return orders.map(o => ({
        ...o,
        customer: { name: o.customer.name, address: o.customer.address, complement: o.customer.complement, lat: o.customer.lat, lng: o.customer.lng },
      }))
    }
  )

  // Reserve a PREPARING order (soft lock with 2-minute TTL)
  app.post(
    '/deliverer/orders/:id/reserve',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }

      const { rows: [order] } = await db.query(
        `SELECT reserved_by, reserved_at FROM orders
         WHERE id = $1 AND store_id = $2 AND status = 'PREPARING' AND deliverer_id IS NULL`,
        [id, req.actor.storeId]
      )
      if (!order) return reply.code(404).send({ error: 'Pedido não encontrado ou não disponível' })

      const reservedBy = (order as Record<string, unknown>).reserved_by as string | null
      const reservedAt = (order as Record<string, unknown>).reserved_at as Date | null

      if (reservedBy && reservedBy !== req.actor.sub) {
        const ageMs = Date.now() - (reservedAt ? new Date(reservedAt).getTime() : 0)
        if (ageMs < 2 * 60 * 1000) {
          return reply.code(409).send({ error: 'Pedido já reservado por outro entregador' })
        }
      }

      await db.query(
        `UPDATE orders SET reserved_by = $1, reserved_at = now() WHERE id = $2`,
        [req.actor.sub, id]
      )
      wsHub.broadcastOrderReservation(req.actor.storeId, id, req.actor.sub)

      return { ok: true }
    }
  )

  // Release a reservation
  app.delete(
    '/deliverer/orders/:id/reserve',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }

      await db.query(
        `UPDATE orders SET reserved_by = NULL, reserved_at = NULL
         WHERE id = $1 AND store_id = $2 AND reserved_by = $3`,
        [id, req.actor.storeId, req.actor.sub]
      )
      wsHub.broadcastOrderReservation(req.actor.storeId, id, null)

      return { ok: true }
    }
  )

  // Claim PREPARING orders — assigns them to this deliverer (status → ASSIGNED) and creates a route
  app.post(
    '/deliverer/orders/claim',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { orderIds } = z.object({ orderIds: z.array(z.string().uuid()).min(1) }).parse(req.body)

      const { rows: [self] } = await db.query(
        'SELECT status FROM deliverers WHERE id = $1',
        [req.actor.sub]
      )
      if (self?.status === 'OFFLINE') {
        return reply.code(409).send({ error: 'Você está OFFLINE. Fique AVAILABLE para aceitar pedidos.' })
      }

      // Claim only orders that are still PREPARING and unclaimed — track which ones succeeded
      const claimedIds: string[] = []
      for (let i = 0; i < orderIds.length; i++) {
        const { rowCount } = await db.query(
          `UPDATE orders
           SET status = 'ASSIGNED', deliverer_id = $1, route_position = $2
           WHERE id = $3 AND store_id = $4 AND status = 'PREPARING' AND deliverer_id IS NULL`,
          [req.actor.sub, i + 1, orderIds[i], req.actor.storeId]
        )
        if ((rowCount ?? 0) > 0) claimedIds.push(orderIds[i]!)
      }

      if (claimedIds.length === 0) {
        return reply.code(409).send({ error: 'Esses pedidos já foram pegos por outro entregador. Atualize a lista.' })
      }

      const route = await routeRepo.create({
        storeId:    req.actor.storeId,
        delivererId: req.actor.sub,
        pickupCode:  generateCode(),
      })
      // Link only the orders actually claimed — not the full original list
      await routeRepo.linkOrders(route.id, claimedIds)

      // Clear reservations — orders are now ASSIGNED, no longer need soft locks
      if (claimedIds.length > 0) {
        await db.query(
          `UPDATE orders SET reserved_by = NULL, reserved_at = NULL WHERE id = ANY($1)`,
          [claimedIds]
        )
      }

      const claimedOrders = await orderRepo.findByRoute(route.id)
      for (const o of claimedOrders) {
        wsHub.broadcastOrderUpdate(req.actor.storeId, o)
        queueNotif(req.actor.storeId, o.id, 'ASSIGNED')
      }
      invalidateStoreOrders(req.actor.storeId)
      invalidateDelivererOrders(req.actor.sub)

      return { route, orders: claimedOrders }
    }
  )

  const pickupSchema   = z.object({ code: z.string() })
  const deliverySchema = z.object({
    code:     z.string().default(''),
    photoUrl:      z.string().optional(),
    lat:           z.number().optional(),
    lng:           z.number().optional(),
    note:          z.string().max(500).optional(),
    cashCollected: z.boolean().optional(),
  })

  app.post(
    '/deliverer/orders/:id/pickup',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { code } = pickupSchema.parse(req.body)
      try {
        const order = await confirmPickup(
          { orderId: id, storeId: req.actor.storeId, delivererId: req.actor.sub, code },
          { orderRepo }
        )
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        invalidateDelivererOrders(req.actor.sub)
        invalidateStoreOrders(req.actor.storeId)
        return order
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  app.post(
    '/deliverer/orders/:id/deliver',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = deliverySchema.parse(req.body)

      const { rows: [settingRow] } = await db.query(
        `SELECT COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
         WHERE s.name = 'require_delivery_code'`,
        [req.actor.storeId]
      )
      const requireDeliveryCode = (settingRow as Record<string, unknown> | undefined)?.value !== 'false'

      // Upload proof photo to storage if provided as base64 data URI
      let photoUrl = body.photoUrl
      if (photoUrl?.startsWith('data:')) {
        try {
          photoUrl = await uploadBase64(`proof/${id}`, photoUrl)
        } catch (uploadErr) {
          req.log.error({ err: uploadErr }, 'proof photo upload failed — delivery will proceed without photo')
          photoUrl = undefined
        }
      }

      try {
        const order = await confirmDelivery(
          { orderId: id, storeId: req.actor.storeId, delivererId: req.actor.sub,
            requireDeliveryCode, ...body, photoUrl },
          { orderRepo }
        )

        if (body.cashCollected) {
          await db.query(
            `UPDATE orders SET cash_collected = TRUE WHERE id = $1`,
            [id]
          )
        }

        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        queueNotif(req.actor.storeId, id, 'DELIVERED')
        invalidateDelivererOrders(req.actor.sub)
        invalidateStoreOrders(req.actor.storeId)

        // Auto-finish route when all its orders are delivered/cancelled
        if (order.routeId) {
          await routeRepo.checkAndFinish(order.routeId, req.actor.storeId)
        }

        return order
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

  // Deliverer returns an order to the PREPARING queue (unassigns themselves)
  app.patch(
    '/deliverer/orders/:id/return-to-queue',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }

      const { rows: [order] } = await db.query(
        `SELECT status, deliverer_id, route_id FROM orders WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' })
      if ((order as Record<string, unknown>).deliverer_id !== req.actor.sub) {
        return reply.code(403).send({ error: 'Você não é o entregador deste pedido' })
      }
      const status = (order as Record<string, unknown>).status as string
      if (!['ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY'].includes(status)) {
        return reply.code(409).send({ error: 'Pedido não pode ser devolvido neste status' })
      }

      await db.transaction(async (client) => {
        const { rows: [{ route_id }] } = await client.query(
          `UPDATE orders
           SET status = 'PREPARING', deliverer_id = NULL, route_id = NULL, route_position = NULL
           WHERE id = $1
           RETURNING route_id`,
          [id]
        )
        if (route_id) {
          await client.query(
            `UPDATE routes
             SET status = 'FINISHED', finished_at = COALESCE(finished_at, now())
             WHERE id = $1
               AND status != 'FINISHED'
               AND NOT EXISTS (SELECT 1 FROM orders WHERE route_id = $1)`,
            [route_id]
          )
        }
      })

      const updated = await orderRepo.findById(id, req.actor.storeId)
      if (updated) wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      invalidateDelivererOrders(req.actor.sub)
      invalidateStoreOrders(req.actor.storeId)

      return { ok: true }
    }
  )

  // Deliverer cancels an order in transit (client refused, problem, etc.)
  app.post(
    '/deliverer/orders/:id/cancel',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { note, lat, lng } = z.object({
        note: z.string().min(1),
        lat:  z.number().optional(),
        lng:  z.number().optional(),
      }).parse(req.body)

      const { rows: [order] } = await db.query(
        `SELECT status, deliverer_id, route_id FROM orders WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' })
      if ((order as Record<string, unknown>).deliverer_id !== req.actor.sub) {
        return reply.code(403).send({ error: 'Você não é o entregador deste pedido' })
      }
      const status = (order as Record<string, unknown>).status as string
      if (!['ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY'].includes(status)) {
        return reply.code(409).send({ error: 'Pedido não pode ser cancelado neste status' })
      }

      await db.query(
        `UPDATE orders
         SET status                     = 'CANCELLED',
             delivery_note              = $2,
             cancel_lat                 = $3,
             cancel_lng                 = $4,
             cancelled_by_deliverer_id  = $5,
             cancelled_at               = now()
         WHERE id = $1`,
        [id, note, lat ?? null, lng ?? null, req.actor.sub]
      )

      const updated = await orderRepo.findById(id, req.actor.storeId)
      if (updated) wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      queueNotif(req.actor.storeId, id, 'CANCELLED')
      invalidateDelivererOrders(req.actor.sub)
      invalidateStoreOrders(req.actor.storeId)

      const routeId = (order as Record<string, unknown>).route_id as string | undefined
      if (routeId) await routeRepo.checkAndFinish(routeId, req.actor.storeId)

      return { ok: true }
    }
  )

  // Hard-delete a single order (store admin, scope-gated)
  app.delete(
    '/orders/:id',
    { preHandler: [requireStoreUser, requireScope('orders:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { rows: [order] } = await db.query(
        `SELECT id, route_id, deliverer_id FROM orders WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!order) return reply.code(404).send({ error: 'Pedido não encontrado' })

      const o = order as Record<string, unknown>
      await db.query(`DELETE FROM orders WHERE id = $1`, [id])

      if (o.route_id) {
        await db.query(
          `UPDATE routes
           SET status = 'FINISHED', finished_at = COALESCE(finished_at, now())
           WHERE id = $1 AND status != 'FINISHED'
             AND NOT EXISTS (SELECT 1 FROM orders WHERE route_id = $1)`,
          [o.route_id]
        )
      }

      await invalidateStoreOrders(req.actor.storeId)
      if (o.deliverer_id) await invalidateDelivererOrders(o.deliverer_id as string)

      return { ok: true }
    }
  )

  // Deliverer saves manual route order (positions 1..n)
  app.patch('/deliverer/orders/route', { preHandler: requireDeliverer }, async (req, reply) => {
    const { orderIds } = z.object({ orderIds: z.array(z.string().uuid()) }).parse(req.body)
    for (let i = 0; i < orderIds.length; i++) {
      await db.query(
        'UPDATE orders SET route_position = $1 WHERE id = $2 AND deliverer_id = $3',
        [i + 1, orderIds[i], req.actor.sub]
      )
    }
    return reply.send({ ok: true })
  })

  app.patch(
    '/deliverer/orders/:id/start-route',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order || order.delivererId !== req.actor.sub) {
        return reply.code(404).send({ error: 'Not found' })
      }
      const updated = await orderRepo.updateStatus(id, 'OUT_FOR_DELIVERY')
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      queueNotif(req.actor.storeId, id, 'OUT_FOR_DELIVERY')
      invalidateDelivererOrders(req.actor.sub)
      invalidateStoreOrders(req.actor.storeId)
      return updated
    }
  )
}
