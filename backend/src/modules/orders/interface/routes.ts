import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { OrderStatus, OrderWithDetails, canTransition, CANCEL_REASON_CODES } from '../domain/entities'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgOrderRepo } from '../infrastructure/repositories/pg-order-repo'
import { createPgRouteRepo } from '../../routes/infrastructure/repositories/pg-route-repo'
import { createPgDelivererRepo } from '../../deliverers/infrastructure/repositories/pg-deliverer-repo'
import { createPgMessageLogRepo } from '../../notifications/infrastructure/repositories/pg-message-log-repo'
import { generateCode } from '../../../shared/utils/code-generator'
import { createOrder } from '../application/use-cases/create-order'
import { assignDeliverer } from '../application/use-cases/assign-deliverer'
import { confirmPickup } from '../application/use-cases/confirm-pickup'
import { confirmDelivery } from '../application/use-cases/confirm-delivery'
import { computeSummary } from '../application/order-summary'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'
import { redis } from '../../../shared/infra/redis'
import { uploadBase64, resolveImageUrl, deleteFiles } from '../../../shared/storage/client'
import { assertCanCreateOrder } from '../../../shared/billing'

const queueNotif = (storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('status_changed', { type: 'whatsapp', storeId, orderId, statusEvent })
    .catch(() => { /* non-fatal */ })

const queuePush = (storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('push', { type: 'push', storeId, orderId, statusEvent })
    .catch(() => { /* non-fatal */ })

// Push targeted at a specific deliverer's devices (worker picks tokens by delivererId)
const queuePushDeliverer = (delivererId: string, storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('push', { type: 'push', delivererId, storeId, orderId, statusEvent })
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

type ProofPhoto = { photoUrl: string; lat?: number; lng?: number }

async function signOrderProof<T extends { proof?: ProofPhoto; proofs: ProofPhoto[] }>(
  order: T
): Promise<T> {
  if (!order.proofs?.length) return order
  const signedProofs = await Promise.all(
    order.proofs.map(async (p) => {
      const url = await resolveImageUrl(p.photoUrl)
      return { ...p, photoUrl: url ?? p.photoUrl }
    })
  )
  return { ...order, proofs: signedProofs, proof: signedProofs[0] }
}

async function signOrdersProof<T extends { proof?: ProofPhoto; proofs: ProofPhoto[] }>(
  orders: T[]
): Promise<T[]> {
  return Promise.all(orders.map(signOrderProof))
}

export async function orderRoutes(app: FastifyInstance) {
  const orderRepo = createPgOrderRepo(db)
  const routeRepo = createPgRouteRepo(db)
  const delivererRepo = createPgDelivererRepo(db)
  const messageLogRepo = createPgMessageLogRepo(db)

  // Auditoria: anexa uma entrada ao log do pedido com o autor (req.actor).
  // Best-effort — nunca derruba a request principal.
  const logEvent = (
    orderId: string,
    actor: { type: string; sub: string; name: string },
    action: string,
    details?: Record<string, unknown>,
  ) =>
    orderRepo.appendLog(orderId, {
      at:     new Date().toISOString(),
      by:     { type: actor.type as 'store_user' | 'deliverer' | 'system', id: actor.sub, name: actor.name },
      action,
      ...(details ? { details } : {}),
    }).catch(() => { /* non-fatal */ })

  // Avança um pedido ON_ROUTE para OUT_FOR_DELIVERY (próxima parada da rota).
  // Dispara o mesmo conjunto de efeitos de uma transição normal: log de sistema,
  // broadcast WS, notificação ao cliente e invalidação de cache.
  const advanceToOutForDelivery = async (
    next: OrderWithDetails,
    storeId: string,
    delivererId?: string,
  ) => {
    // Idempotente: só notifica se ESTE chamada moveu o pedido de ON_ROUTE.
    const advanced = await orderRepo.transitionToOutForDelivery(next.id)
    if (!advanced) return
    await orderRepo.appendLog(next.id, {
      at:     new Date().toISOString(),
      by:     { type: 'system' },
      action: 'OUT_FOR_DELIVERY',
      details: { trigger: 'route_auto_advance' },
    }).catch(() => { /* non-fatal */ })

    const updated = await orderRepo.findById(next.id, storeId)
    wsHub.broadcastOrderUpdate(storeId, updated ?? next)
    queueNotif(storeId, next.id, 'OUT_FOR_DELIVERY')
    if (delivererId) invalidateDelivererOrders(delivererId)
    invalidateStoreOrders(storeId)
  }

  // ── Public tracking (no auth) ────────────────────────────────────────────
  app.get('/tracking/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string }

    // Authenticated users (JWT present and valid) always bypass expiry + senha
    let isAuthenticated = false
    try {
      await req.jwtVerify()
      isAuthenticated = true
    } catch { /* public access — ok */ }

    // Gate de senha para acesso público: exige os últimos 4 dígitos do telefone
    // do cliente ANTES de retornar qualquer dado do pedido.
    if (!isAuthenticated) {
      const { rows: [row] } = await db.query(
        `SELECT c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
        [orderId]
      )
      if (!row) return reply.code(404).send({ error: 'Not found' })
      const expected = ((row as Record<string, unknown>).phone as string ?? '').replace(/\D/g, '').slice(-4)
      const provided = ((req.headers['x-tracking-code'] as string | undefined) ?? '').replace(/\D/g, '').slice(-4)
      if (!expected || provided !== expected) {
        reply.header('WWW-Authenticate', 'TrackingCode realm="rastreio"')
        return reply.code(401).send({
          error: 'password_required',
          hint:  'Informe os últimos 4 dígitos do telefone do cliente',
        })
      }
    }

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

    // Attach deliverer's last known live position (from location_history, updated every ~15s),
    // a foto do entregador e o tracejado do trajeto desta entrega.
    let delivererLat: number | null = null
    let delivererLng: number | null = null
    let delivererPhotoUrl: string | null = null
    let trail: { lat: number; lng: number }[] = []
    if ((order as { deliverer?: unknown }).deliverer) {
      const { rows: [meta] } = await db.query(
        `SELECT deliverer_id,
                COALESCE(out_for_delivery_at, picked_up_at, created_at) AS trail_start,
                COALESCE(delivered_at, now())                            AS trail_end
         FROM orders WHERE id = $1`,
        [orderId]
      )
      const delivererId = (meta as Record<string, unknown> | undefined)?.deliverer_id as string | undefined
      if (delivererId) {
        const [{ rows: lastRows }, { rows: photoRows }, { rows: trailRows }] = await Promise.all([
          db.query(
            `SELECT lat, lng FROM location_history
             WHERE deliverer_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
            [delivererId]
          ),
          db.query('SELECT profile_image_url FROM deliverers WHERE id = $1', [delivererId]),
          db.query(
            `SELECT lat, lng FROM location_history
             WHERE deliverer_id = $1 AND recorded_at >= $2 AND recorded_at <= $3
             ORDER BY recorded_at ASC LIMIT 1000`,
            [delivererId, (meta as Record<string, unknown>).trail_start, (meta as Record<string, unknown>).trail_end]
          ),
        ])
        if (lastRows[0]) {
          delivererLat = (lastRows[0] as Record<string, unknown>).lat as number
          delivererLng = (lastRows[0] as Record<string, unknown>).lng as number
        }
        delivererPhotoUrl = await resolveImageUrl(
          (photoRows[0] as Record<string, unknown> | undefined)?.profile_image_url as string | null
        ) ?? null
        trail = (trailRows as Array<{ lat: number; lng: number }>).map(r => ({
          lat: Number(r.lat), lng: Number(r.lng),
        }))
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

    return { ...order, delivererLat, delivererLng, delivererPhotoUrl, trail, ratingEnabled, storeTheme }
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
      // Assistants only see orders they created, unless granted the
      // 'orders:view_all' scope (then they see the whole store, like managers).
      const restrictToOwn =
        req.actor.type === 'store_user' &&
        req.actor.role === 'ASSISTANT' &&
        !(req.actor.scopes ?? []).includes('orders:view_all')
      const filters = {
        status:          status as OrderStatus | undefined,
        delivererId,
        createdByUserId: restrictToOwn ? req.actor.sub : undefined,
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

  // Paginated, filterable list (full order history) — customer name, date range, status
  app.get(
    '/orders/search',
    { preHandler: requireStoreUser },
    async (req) => {
      const { status, customerName, dateFrom, dateTo, page } = req.query as Record<string, string>
      // Assistants only see their own orders unless granted 'orders:view_all'.
      const restrictToOwn =
        req.actor.type === 'store_user' &&
        req.actor.role === 'ASSISTANT' &&
        !(req.actor.scopes ?? []).includes('orders:view_all')
      const limit   = 20
      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)

      const { items, total } = await orderRepo.searchByStore(req.actor.storeId, {
        status:          status as OrderStatus | undefined,
        customerName:    customerName || undefined,
        dateFrom:        dateFrom || undefined,
        dateTo:          dateTo || undefined,
        createdByUserId: restrictToOwn ? req.actor.sub : undefined,
        page:            pageNum,
        limit,
      })

      const pages = Math.max(1, Math.ceil(total / limit))
      return { items: await signOrdersProof(items), total, page: pageNum, pages }
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

  // Mensagens (WhatsApp) enviadas ao cliente deste pedido — texto, status e
  // horário, em ordem cronológica. Escopo por loja via store_id na query.
  app.get(
    '/orders/:id/messages',
    { preHandler: [requireStoreUser, requireScope('orders:view')] },
    async (req) => {
      const { id } = req.params as { id: string }
      return messageLogRepo.findByOrder(req.actor.storeId, id)
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

      logEvent(order.id, actor, 'CREATED')
      wsHub.broadcastOrderUpdate(storeId, order)
      queueNotif(storeId, order.id, 'PREPARING')
      queuePush(storeId, order.id, 'PREPARING')
      invalidateStoreOrders(storeId)
      return reply.code(201).send(order)
    }
  )

  const assignSchema = z.object({
    delivererId:   z.string().uuid(),
    routePosition: z.number().int().min(1).optional(),
    // Para adicionar a uma rota ativa existente do entregador em vez de criar
    // uma nova: routeId da rota + orderIds com a ordem final completa dos pedidos
    // da rota (incluindo o que está sendo atribuído).
    routeId:       z.string().uuid().optional(),
    orderIds:      z.array(z.string().uuid()).optional(),
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

      // ── Adicionar a uma rota ativa existente do entregador ────────────────
      if (body.routeId) {
        const { rows: [route] } = await db.query(
          `SELECT id, store_id, status FROM routes WHERE id = $1 AND store_id = $2 AND deliverer_id = $3`,
          [body.routeId, req.actor.storeId, body.delivererId]
        )
        if (!route) return reply.code(404).send({ error: 'Rota não encontrada para este entregador' })
        if (route.status !== 'CREATED' && route.status !== 'STARTED') {
          return reply.code(409).send({ error: 'A rota não está mais ativa' })
        }

        // O pedido precisa estar livre (PREPARING, sem entregador) para entrar na rota.
        const { rows: [target] } = await db.query(
          `SELECT status, deliverer_id FROM orders WHERE id = $1 AND store_id = $2`,
          [id, req.actor.storeId]
        )
        if (!target) return reply.code(404).send({ error: 'Pedido não encontrado' })
        if (target.status !== 'PREPARING' || target.deliverer_id) {
          return reply.code(409).send({ error: 'Pedido não está disponível para atribuição' })
        }

        // orderIds = ordem final completa; deve conter os pedidos atuais da rota + este pedido.
        const { rows: currentRows } = await db.query(
          `SELECT id FROM orders WHERE route_id = $1`, [body.routeId]
        )
        const currentIds = (currentRows as Record<string, unknown>[]).map(r => r.id as string)
        const desiredIds = body.orderIds && body.orderIds.length > 0
          ? body.orderIds
          : [...currentIds, id]   // sem ordem informada: novo pedido vai para o fim
        const desiredSet = new Set(desiredIds)
        if (!desiredIds.includes(id) || currentIds.some(cid => !desiredSet.has(cid))
            || desiredIds.length !== currentIds.length + 1) {
          return reply.code(400).send({ error: 'Lista de ordenação inválida para a rota' })
        }

        // Rota já iniciada → entregador está na rua; entra como ON_ROUTE (já retirado).
        // Rota só criada → entra como ASSIGNED (será retirado junto da rota).
        const newStatus = route.status === 'STARTED' ? 'ON_ROUTE' : 'ASSIGNED'
        const markPickedUp = newStatus === 'ON_ROUTE'
        const { rowCount } = await db.query(
          `UPDATE orders
              SET status = $1::order_status, deliverer_id = $2, route_id = $3,
                  picked_up_at = CASE WHEN $6 THEN now() ELSE picked_up_at END,
                  accepted_at = COALESCE(accepted_at, now()),
                  reserved_by = NULL, reserved_at = NULL
            WHERE id = $4 AND store_id = $5 AND status = 'PREPARING' AND deliverer_id IS NULL`,
          [newStatus, body.delivererId, body.routeId, id, req.actor.storeId, markPickedUp]
        )
        if ((rowCount ?? 0) === 0) {
          return reply.code(409).send({ error: 'Pedido já foi atribuído. Atualize a lista.' })
        }

        // Renumera as posições conforme a ordem final.
        for (let i = 0; i < desiredIds.length; i++) {
          await db.query(
            `UPDATE orders SET route_position = $1 WHERE id = $2 AND route_id = $3`,
            [i + 1, desiredIds[i], body.routeId]
          )
        }

        logEvent(id, req.actor, 'ASSIGNED', { delivererId: body.delivererId, routeId: body.routeId })
        const fullRoute = await routeRepo.findById(body.routeId, req.actor.storeId)
        const orders = await orderRepo.findByRoute(body.routeId)
        for (const o of orders) wsHub.broadcastOrderUpdate(req.actor.storeId, o)
        queueNotif(req.actor.storeId, id, newStatus)
        invalidateStoreOrders(req.actor.storeId)
        invalidateDelivererOrders(body.delivererId)
        const order = await orderRepo.findById(id, req.actor.storeId)
        return { route: fullRoute, order }
      }

      // ── Criar uma nova rota só com este pedido (comportamento padrão) ─────
      let order
      try {
        order = await assignDeliverer(
          { orderId: id, storeId: req.actor.storeId, delivererId: body.delivererId, routePosition: body.routePosition },
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

      logEvent(order.id, req.actor, 'ASSIGNED', { delivererId: body.delivererId })
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
      const { reasonCode, note } = z.object({
        reasonCode: z.enum(CANCEL_REASON_CODES).optional(),
        note:       z.string().optional(),
      }).parse(req.body ?? {})

      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order) return reply.code(404).send({ error: 'Not found' })

      // cancel_reason guarda o código; delivery_note só recebe o texto livre do 'OTHER'.
      const trimmedNote = note?.trim()
      await db.query(
        `UPDATE orders SET status = 'CANCELLED', cancel_reason = $2, delivery_note = $3
         WHERE id = $1 AND store_id = $4`,
        [id, reasonCode ?? null, reasonCode === 'OTHER' ? (trimmedNote || null) : null, req.actor.storeId]
      )
      const updated = await orderRepo.findById(id, req.actor.storeId)
      logEvent(id, req.actor, 'CANCELLED', { reasonCode, note: trimmedNote })
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

      const previousNote = order.notes ?? null
      await db.query(
        `UPDATE orders SET notes = $1 WHERE id = $2`,
        [note.trim() || null, id]
      )
      logEvent(id, req.actor, 'NOTE_CHANGED', { from: previousNote, to: note.trim() || null })
      const updated = (await orderRepo.findById(id, req.actor.storeId))!
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      invalidateStoreOrders(req.actor.storeId)
      if (updated.delivererId) invalidateDelivererOrders(updated.delivererId as string)
      return updated
    }
  )

  // Store user fixes the delivery address of an order by picking one of the customer's addresses.
  // Writes the override columns (delivery_address/lat/lng) and notifies customer + deliverer.
  app.patch(
    '/orders/:id/delivery-address',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { addressId } = z.object({ addressId: z.string().uuid() }).parse(req.body)

      const order = await orderRepo.findById(id, req.actor.storeId)
      if (!order) return reply.code(404).send({ error: 'Not found' })
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        return reply.code(400).send({ error: 'Não é possível alterar o endereço de um pedido finalizado' })
      }

      const { rows: [addr] } = await db.query(
        `SELECT address, number, complement, lat, lng
         FROM customer_addresses
         WHERE id = $1 AND customer_id = $2 AND store_id = $3`,
        [addressId, order.customerId, req.actor.storeId]
      )
      if (!addr) return reply.code(404).send({ error: 'Endereço não encontrado para este cliente' })

      const base = addr.number ? `${addr.address}, ${addr.number}` : (addr.address as string)
      const fullAddress = addr.complement ? `${base} - ${addr.complement}` : base

      await db.query(
        `UPDATE orders SET delivery_address = $1, delivery_lat = $2, delivery_lng = $3 WHERE id = $4`,
        [fullAddress, addr.lat ?? null, addr.lng ?? null, id]
      )
      logEvent(id, req.actor, 'ADDRESS_CHANGED', { from: order.customer.address, to: fullAddress })

      const updated = (await orderRepo.findById(id, req.actor.storeId))!
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)

      // Notify the customer (WhatsApp) and the deliverer (push), if one is assigned
      queueNotif(req.actor.storeId, id, 'ADDRESS_CHANGED')
      if (updated.delivererId) {
        queuePushDeliverer(updated.delivererId as string, req.actor.storeId, id, 'ADDRESS_CHANGED')
      }

      invalidateStoreOrders(req.actor.storeId)
      if (updated.delivererId) invalidateDelivererOrders(updated.delivererId as string)

      return updated
    }
  )

  // Resumo de pedidos atrasados (limiar vermelho) + contagem de entregadores —
  // alimenta o alerta e o popup de detalhes em /orders.
  app.get('/orders/pickup-alert', { preHandler: requireStoreUser }, async (req) => {
    const [summary, deliverers] = await Promise.all([
      orderRepo.findDelayedSummary(req.actor.storeId),
      delivererRepo.routeStatusCounts(req.actor.storeId),
    ])
    return { ...summary, deliverers }
  })

  // Dispara um push para os entregadores livres avisando sobre pedidos atrasados
  // aguardando retirada (apenas pedidos ainda NÃO retirados são contabilizados).
  app.post('/orders/notify-pickup', { preHandler: requireStoreUser }, async (req) => {
    const { pickupDelayed, prepRedMin } = await orderRepo.findDelayedSummary(req.actor.storeId)
    if (pickupDelayed === 0) return { notified: 0, count: 0, minutes: prepRedMin }

    const delivererIds = await delivererRepo.findIdleIds(req.actor.storeId)
    if (delivererIds.length === 0) return { notified: 0, count: pickupDelayed, minutes: prepRedMin }

    await notificationQueue.add('pickup_reminder', {
      type:         'pickup_reminder',
      storeId:      req.actor.storeId,
      delivererIds,
      count:        pickupDelayed,
      minutes:      prepRedMin,
    }).catch(() => { /* non-fatal */ })

    return { notified: delivererIds.length, count: pickupDelayed, minutes: prepRedMin }
  })

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
            `UPDATE orders SET deliverer_id = $2, route_position = $3, status = 'ASSIGNED',
                    accepted_at = COALESCE(accepted_at, now())
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
        logEvent(order.id, req.actor, 'ASSIGNED', { delivererId, routeId: route.id })
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

  // Analítico do entregador: entregas de hoje + resumo do mês (entregas,
  // canceladas por ele, viagens/rotas finalizadas). Fronteiras em America/Sao_Paulo.
  app.get('/deliverer/analytics', { preHandler: requireDeliverer }, async (req) => {
    const raw = (req.query as { month?: string }).month
    const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 7)
    const monthStart = `${month}-01`

    const { rows: [r] } = await db.query(
      `WITH bounds AS (
         SELECT ($2::date)::timestamp AT TIME ZONE 'America/Sao_Paulo'                       AS start_ts,
                (($2::date) + interval '1 month')::timestamp AT TIME ZONE 'America/Sao_Paulo' AS end_ts
       )
       SELECT
         (SELECT count(*) FROM orders
            WHERE deliverer_id = $1 AND status = 'DELIVERED'
              AND (delivered_at AT TIME ZONE 'America/Sao_Paulo')::date
                = (now() AT TIME ZONE 'America/Sao_Paulo')::date)                  AS today_deliveries,
         (SELECT count(*) FROM orders, bounds
            WHERE deliverer_id = $1 AND status = 'DELIVERED'
              AND delivered_at >= bounds.start_ts AND delivered_at < bounds.end_ts) AS month_deliveries,
         (SELECT count(*) FROM orders, bounds
            WHERE cancelled_by_deliverer_id = $1
              AND cancelled_at >= bounds.start_ts AND cancelled_at < bounds.end_ts) AS month_cancelled,
         (SELECT count(*) FROM routes, bounds
            WHERE deliverer_id = $1 AND status = 'FINISHED'
              AND finished_at >= bounds.start_ts AND finished_at < bounds.end_ts)   AS month_routes`,
      [req.actor.sub, monthStart]
    )
    const row = r as Record<string, unknown>
    return {
      month,
      today: { deliveries: Number(row.today_deliveries ?? 0) },
      monthSummary: {
        deliveries: Number(row.month_deliveries ?? 0),
        cancelled:  Number(row.month_cancelled ?? 0),
        routes:     Number(row.month_routes ?? 0),
      },
    }
  })

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
           SET status = 'ASSIGNED', deliverer_id = $1, route_position = $2,
               accepted_at = COALESCE(accepted_at, now())
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
    code:          z.string().default(''),
    photoUrl:      z.string().optional(),                      // legacy: old app — single photo
    photoUrls:     z.array(z.string()).optional(),             // new: multiple photos
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
        logEvent(id, req.actor, 'PICKED_UP')
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

      const { rows: settingRows } = await db.query(
        `SELECT s.name, COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
         WHERE s.name IN ('require_delivery_code', 'enforce_delivery_order',
                          'delivery_require_proximity', 'delivery_proximity_meters')`,
        [req.actor.storeId]
      )
      const sv = Object.fromEntries(
        settingRows.map((r: Record<string, unknown>) => [r.name as string, r.value as string])
      )
      const requireDeliveryCode = sv.require_delivery_code !== 'false'
      const enforceOrder        = sv.enforce_delivery_order === 'true'
      const requireProximity    = sv.delivery_require_proximity === 'true'
      const proximityMeters     = parseInt(sv.delivery_proximity_meters ?? '100', 10) || 100

      // Normalise: old clients send `photoUrl`, new clients send `photoUrls[]`
      const rawUrls = body.photoUrls?.length
        ? body.photoUrls
        : body.photoUrl ? [body.photoUrl] : []

      // Read max_proof_photos setting
      const { rows: [maxRow] } = await db.query(
        `SELECT COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
         WHERE s.name = 'max_proof_photos'`,
        [req.actor.storeId]
      )
      const maxPhotos = parseInt((maxRow as Record<string, unknown> | undefined)?.value as string ?? '1', 10) || 1
      const cappedUrls = rawUrls.slice(0, maxPhotos)

      // Upload each photo (base64 data URIs → storage)
      const uploadedUrls: string[] = []
      for (let i = 0; i < cappedUrls.length; i++) {
        const url = cappedUrls[i]!
        if (url.startsWith('data:')) {
          try {
            uploadedUrls.push(await uploadBase64(`proof/${id}/${i + 1}`, url))
          } catch (uploadErr) {
            req.log.error({ err: uploadErr }, 'proof photo upload failed — skipping')
          }
        } else {
          uploadedUrls.push(url)
        }
      }

      try {
        const order = await confirmDelivery(
          { orderId: id, storeId: req.actor.storeId, delivererId: req.actor.sub,
            requireDeliveryCode, code: body.code, photoUrls: uploadedUrls,
            lat: body.lat, lng: body.lng, note: body.note,
            enforceOrder, requireProximity, proximityMeters },
          { orderRepo, log: req.log }
        )

        if (body.cashCollected) {
          await db.query(
            `UPDATE orders SET cash_collected = TRUE WHERE id = $1`,
            [id]
          )
        }

        // Auditoria + resumo de tempos: registra a entrega e calcula os
        // segmentos entre cada mudança de status a partir do log completo.
        await logEvent(id, req.actor, 'DELIVERED')
        const fullOrder = await orderRepo.findById(id, req.actor.storeId)
        if (fullOrder?.log) {
          await orderRepo.setSummary(id, computeSummary(fullOrder.log)).catch(() => { /* non-fatal */ })
        }
        wsHub.broadcastOrderUpdate(req.actor.storeId, fullOrder ?? order)
        queueNotif(req.actor.storeId, id, 'DELIVERED')
        invalidateDelivererOrders(req.actor.sub)
        invalidateStoreOrders(req.actor.storeId)

        // Auto-avanço da rota: a próxima parada (pedido ON_ROUTE de menor
        // posição) entra em OUT_FOR_DELIVERY, disparando suas notificações.
        if (order.routeId) {
          const next = await orderRepo.findNextOnRoute(order.routeId)
          if (next) await advanceToOutForDelivery(next, req.actor.storeId, order.delivererId)
        }

        // Auto-finish route when all its orders are delivered/cancelled
        if (order.routeId) {
          const finished = await routeRepo.checkAndFinish(order.routeId, req.actor.storeId)
          // Rota fechou → entregador ficou livre. Se há pedidos prontos esperando,
          // avisa o entregador (push) e o operador (WS) para organizar logo.
          if (finished) {
            const { rows: [waiting] } = await db.query(
              `SELECT COUNT(*)::int AS count FROM orders
               WHERE store_id = $1 AND status = 'PREPARING' AND deliverer_id IS NULL`,
              [req.actor.storeId]
            )
            const waitingCount = (waiting as { count: number } | undefined)?.count ?? 0
            if (waitingCount > 0) {
              notificationQueue.add('route_done_waiting', {
                type:        'route_done_waiting',
                storeId:     req.actor.storeId,
                delivererId: req.actor.sub,
                count:       waitingCount,
              }).catch(() => { /* non-fatal */ })
              wsHub.broadcastDelivererIdleWaiting(req.actor.storeId, {
                delivererId:   req.actor.sub,
                delivererName: req.actor.name,
                waitingCount,
              })
            }
          }
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

      const { rows: [{ route_id: returnedRouteId }] } = await db.query(
        `UPDATE orders
         SET status = 'PREPARING', deliverer_id = NULL, route_id = NULL, route_position = NULL
         WHERE id = $1
         RETURNING route_id`,
        [id]
      )
      // Finaliza a rota se, após sair este pedido, os restantes já estiverem todos
      // entregues/cancelados (ou a rota tiver ficado vazia). checkAndFinish cobre
      // ambos os casos (route_id sem pedidos pendentes → FINISHED).
      if (returnedRouteId) {
        await routeRepo.checkAndFinish(returnedRouteId as string, req.actor.storeId)
      }

      logEvent(id, req.actor, 'RETURNED_TO_QUEUE')
      const updated = await orderRepo.findById(id, req.actor.storeId)
      if (updated) wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      invalidateDelivererOrders(req.actor.sub)
      invalidateStoreOrders(req.actor.storeId)

      return { ok: true }
    }
  )

  // Deliverer cancels an order in transit (client refused, problem, etc.)
  // Lógica comum de cancelamento pelo entregador (v1 e v2). Valida dono/status,
  // grava o cancelamento e dispara os efeitos colaterais. Retorna um erro de
  // resposta (statusCode + message) ou null em caso de sucesso.
  const cancelOrderByDeliverer = async (
    req: { params: unknown; actor: { sub: string; storeId: string; type: string; name: string } },
    args: { deliveryNote: string | null; cancelReason: string | null; lat?: number; lng?: number },
  ): Promise<{ code: number; error: string } | null> => {
    const { id } = req.params as { id: string }

    const { rows: [order] } = await db.query(
      `SELECT status, deliverer_id, route_id FROM orders WHERE id = $1 AND store_id = $2`,
      [id, req.actor.storeId]
    )
    if (!order) return { code: 404, error: 'Pedido não encontrado' }
    if ((order as Record<string, unknown>).deliverer_id !== req.actor.sub) {
      return { code: 403, error: 'Você não é o entregador deste pedido' }
    }
    const status = (order as Record<string, unknown>).status as string
    if (!['ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY'].includes(status)) {
      return { code: 409, error: 'Pedido não pode ser cancelado neste status' }
    }

    await db.query(
      `UPDATE orders
       SET status                     = 'CANCELLED',
           delivery_note              = $2,
           cancel_reason              = $3,
           cancel_lat                 = $4,
           cancel_lng                 = $5,
           cancelled_by_deliverer_id  = $6,
           cancelled_at               = now()
       WHERE id = $1`,
      [id, args.deliveryNote, args.cancelReason, args.lat ?? null, args.lng ?? null, req.actor.sub]
    )

    logEvent(id, req.actor, 'CANCELLED', { reasonCode: args.cancelReason, note: args.deliveryNote })
    const updated = await orderRepo.findById(id, req.actor.storeId)
    if (updated) wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
    queueNotif(req.actor.storeId, id, 'CANCELLED')
    invalidateDelivererOrders(req.actor.sub)
    invalidateStoreOrders(req.actor.storeId)

    const routeId = (order as Record<string, unknown>).route_id as string | undefined
    if (routeId) await routeRepo.checkAndFinish(routeId, req.actor.storeId)

    return null
  }

  // v1 (legado): motivo livre obrigatório em `note`, sem código. Mantido para
  // apps antigos já publicados.
  app.post(
    '/deliverer/orders/:id/cancel',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { note, lat, lng } = z.object({
        note: z.string().min(1),
        lat:  z.number().optional(),
        lng:  z.number().optional(),
      }).parse(req.body)

      const err = await cancelOrderByDeliverer(req, {
        deliveryNote: note, cancelReason: null, lat, lng,
      })
      if (err) return reply.code(err.code).send({ error: err.error })
      return { ok: true }
    }
  )

  // v2: motivo estruturado obrigatório (código). Texto livre só quando 'OTHER'.
  app.post(
    '/deliverer/orders/:id/cancel-v2',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { reasonCode, note, lat, lng } = z.object({
        reasonCode: z.enum(CANCEL_REASON_CODES),
        note:       z.string().optional(),
        lat:        z.number().optional(),
        lng:        z.number().optional(),
      }).parse(req.body)

      // Texto livre do 'OTHER' é opcional: sem ele o cancelamento ainda agrupa
      // em OTHER no relatório. Motivos fixos nunca têm texto.
      const trimmedNote = note?.trim()
      const err = await cancelOrderByDeliverer(req, {
        deliveryNote: reasonCode === 'OTHER' ? (trimmedNote || null) : null,
        cancelReason: reasonCode,
        lat, lng,
      })
      if (err) return reply.code(err.code).send({ error: err.error })
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

      const { rows: proofRows } = await db.query(
        `SELECT photo_url FROM proof_of_delivery WHERE order_id = $1`,
        [id]
      )

      const o = order as Record<string, unknown>
      await db.query(`DELETE FROM orders WHERE id = $1`, [id])

      // Finaliza a rota se os pedidos restantes já estiverem todos concluídos
      // (ou a rota tiver ficado vazia) — não apenas quando fica vazia.
      if (o.route_id) {
        await routeRepo.checkAndFinish(o.route_id as string, req.actor.storeId)
      }

      await invalidateStoreOrders(req.actor.storeId)
      if (o.deliverer_id) await invalidateDelivererOrders(o.deliverer_id as string)

      const photoPaths = proofRows.map((r: Record<string, unknown>) => r.photo_url as string)
      deleteFiles(photoPaths).catch(err =>
        req.log.error({ err, orderId: id }, 'failed to delete proof photos from storage')
      )

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

  // Deliverer adds PREPARING orders to one of their own routes (CREATED or STARTED) and
  // saves the new full order. New orders join as ON_ROUTE (STARTED) or ASSIGNED (CREATED).
  app.patch('/deliverer/routes/:id/orders', { preHandler: requireDeliverer }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { orderIds } = z.object({ orderIds: z.array(z.string().uuid()).min(1) }).parse(req.body)

    const { rows: [route] } = await db.query(
      `SELECT id, store_id, status FROM routes WHERE id = $1 AND deliverer_id = $2`,
      [id, req.actor.sub]
    )
    if (!route) return reply.code(404).send({ error: 'Rota não encontrada' })
    if (route.status !== 'CREATED' && route.status !== 'STARTED') {
      return reply.code(400).send({ error: 'Só é possível editar rotas criadas ou em andamento' })
    }
    const storeId = route.store_id as string

    // Orders currently in the route — editing can reorder/add but not remove them
    const { rows: currentRows } = await db.query(
      `SELECT id FROM orders WHERE route_id = $1`,
      [id]
    )
    const currentIds = (currentRows as Record<string, unknown>[]).map(r => r.id as string)
    for (const cid of currentIds) {
      if (!orderIds.includes(cid)) {
        return reply.code(400).send({ error: 'Não é permitido remover pedidos da rota' })
      }
    }
    const currentSet = new Set(currentIds)
    const newIds = orderIds.filter(oid => !currentSet.has(oid))

    // New orders join the route. On a started route they go straight to ON_ROUTE (the
    // deliverer is already out); otherwise ASSIGNED. Atomic guard against races.
    const newStatus = route.status === 'STARTED' ? 'ON_ROUTE' : 'ASSIGNED'
    const markPickedUp = newStatus === 'ON_ROUTE'
    for (const oid of newIds) {
      const { rowCount } = await db.query(
        `UPDATE orders
            SET status = $1::order_status, deliverer_id = $2, route_id = $3,
                picked_up_at = CASE WHEN $6 THEN now() ELSE picked_up_at END,
                reserved_by = NULL, reserved_at = NULL
          WHERE id = $4 AND store_id = $5 AND status = 'PREPARING'
            AND (deliverer_id IS NULL OR reserved_by = $2)`,
        [newStatus, req.actor.sub, id, oid, storeId, markPickedUp]
      )
      if ((rowCount ?? 0) === 0) {
        return reply.code(409).send({ error: 'Um dos pedidos já foi pego por outro entregador. Atualize a lista.' })
      }
    }

    // Renumber positions in the requested order
    for (let i = 0; i < orderIds.length; i++) {
      await db.query(
        `UPDATE orders SET route_position = $1 WHERE id = $2 AND route_id = $3`,
        [i + 1, orderIds[i], id]
      )
    }

    const orders = await orderRepo.findByRoute(id)
    for (const o of orders) wsHub.broadcastOrderUpdate(storeId, o)
    for (const oid of newIds) queueNotif(storeId, oid, newStatus)
    invalidateStoreOrders(storeId)
    invalidateDelivererOrders(req.actor.sub)

    return reply.send({ ok: true, orders })
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
      // Idempotente: se o pedido já está OUT_FOR_DELIVERY (ex.: a rota já o avançou
      // automaticamente), não re-notifica — apenas devolve o estado atual.
      const updated = await orderRepo.transitionToOutForDelivery(id)
      if (!updated) return order
      logEvent(id, req.actor, 'OUT_FOR_DELIVERY')
      wsHub.broadcastOrderUpdate(req.actor.storeId, updated)
      queueNotif(req.actor.storeId, id, 'OUT_FOR_DELIVERY')
      invalidateDelivererOrders(req.actor.sub)
      invalidateStoreOrders(req.actor.storeId)
      return updated
    }
  )
}
