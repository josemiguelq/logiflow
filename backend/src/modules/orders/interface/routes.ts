import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderStatus } from '../domain/entities'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
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
      const { status, delivererId, page, limit } = req.query as Record<string, string>
      const isAssistant = req.actor.type === 'store_user' && req.actor.role === 'ASSISTANT'
      const filters = {
        status:          status as OrderStatus | undefined,
        delivererId,
        createdByUserId: isAssistant ? req.actor.sub : undefined,
        page:            page ? Number(page) : 1,
        limit:           limit ? Number(limit) : 50,
      }
      const orders = await orderRepo.findByStore(req.actor.storeId, filters)
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
      return order
    }
  )

  const createSchema = z.object({
    customerId:      z.string().uuid(),
    notes:           z.string().optional(),
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
          deliveryAddress: body.deliveryAddress, deliveryLat: body.deliveryLat, deliveryLng: body.deliveryLng },
        { orderRepo }
      )

      wsHub.broadcastOrderUpdate(storeId, order)
      queueNotif(storeId, order.id, 'PREPARING')
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

      if (order.routeId) {
        await routeRepo.checkAndFinish(order.routeId, req.actor.storeId)
      }

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

      const route = await routeRepo.create({
        storeId:     req.actor.storeId,
        delivererId,
        pickupCode:  generateCode(),
      })

      const assigned = []
      for (let i = 0; i < orderIds.length; i++) {
        try {
          const order = await assignDeliverer(
            { orderId: orderIds[i]!, storeId: req.actor.storeId, delivererId, routePosition: i + 1 },
            { orderRepo }
          )
          wsHub.broadcastOrderUpdate(req.actor.storeId, order)
          queueNotif(req.actor.storeId, order.id, 'ASSIGNED')
          assigned.push(order)
        } catch { /* skip orders that can't transition */ }
      }

      const assignedIds = assigned.map(o => o.id)
      await routeRepo.linkOrders(route.id, assignedIds)

      return { route, orders: assigned }
    }
  )

  // ── Deliverer routes ─────────────────────────────────────────────────────
  app.get(
    '/deliverer/orders',
    { preHandler: requireDeliverer },
    async (req) => signOrdersProof(await orderRepo.findByDeliverer(req.actor.sub))
  )

  // PREPARING orders available for any deliverer in this store to claim
  app.get(
    '/deliverer/orders/preparing',
    { preHandler: requireDeliverer },
    async (req) => orderRepo.findPreparing(req.actor.storeId)
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

      for (let i = 0; i < orderIds.length; i++) {
        await db.query(
          `UPDATE orders
           SET status = 'ASSIGNED', deliverer_id = $1, route_position = $2
           WHERE id = $3 AND store_id = $4 AND status = 'PREPARING' AND deliverer_id IS NULL`,
          [req.actor.sub, i + 1, orderIds[i], req.actor.storeId]
        )
      }

      const route = await routeRepo.create({
        storeId:    req.actor.storeId,
        delivererId: req.actor.sub,
        pickupCode:  generateCode(),
      })
      await routeRepo.linkOrders(route.id, orderIds)

      const claimedOrders = await orderRepo.findByRoute(route.id)
      for (const o of claimedOrders) {
        wsHub.broadcastOrderUpdate(req.actor.storeId, o)
        queueNotif(req.actor.storeId, o.id, 'ASSIGNED')
      }

      return { route, orders: claimedOrders }
    }
  )

  const pickupSchema   = z.object({ code: z.string() })
  const deliverySchema = z.object({
    code:     z.string().default(''),
    photoUrl: z.string().optional(),
    lat:      z.number().optional(),
    lng:      z.number().optional(),
    note:     z.string().max(500).optional(),
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
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        queueNotif(req.actor.storeId, id, 'DELIVERED')

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
      return updated
    }
  )
}
