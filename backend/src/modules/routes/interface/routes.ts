import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgRouteRepo } from '../infrastructure/repositories/pg-route-repo'
import { createPgOrderRepo } from '../../orders/infrastructure/repositories/pg-order-repo'
import { OrderStatus, canTransition } from '../../orders/domain/entities'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'
import { redis } from '../../../shared/infra/redis'

const queueNotif = (storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('status_changed', { type: 'whatsapp', storeId, orderId, statusEvent })
    .catch(() => { /* non-fatal */ })

const queuePush = (delivererId: string, orderId: string, storeId: string, statusEvent: string) =>
  notificationQueue.add('push', { type: 'push', delivererId, orderId, storeId, statusEvent })
    .catch(() => { /* non-fatal */ })

export async function routeRoutes(app: FastifyInstance) {
  const routeRepo = createPgRouteRepo(db)
  const orderRepo = createPgOrderRepo(db)

  // Auditoria da rota: anexa uma entrada ao log com o autor (req.actor).
  // Best-effort — nunca derruba a request principal.
  const logRouteEvent = (
    routeId: string,
    actor: { type: string; sub: string; name: string },
    action: string,
    details?: Record<string, unknown>,
  ) =>
    routeRepo.appendLog(routeId, {
      at:     new Date().toISOString(),
      by:     { type: actor.type as 'store_user' | 'deliverer' | 'system', id: actor.sub, name: actor.name },
      action,
      ...(details ? { details } : {}),
    }).catch(() => { /* non-fatal */ })

  // ── Store routes ──────────────────────────────────────────────────────────
  app.get('/routes', { preHandler: requireStoreUser }, async (req) => {
    const { page, delivererId, from, to } = req.query as {
      page?: string; delivererId?: string; from?: string; to?: string
    }
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
    const { items, total } = await routeRepo.findByStore(req.actor.storeId, pageNum, 15, { delivererId, from, to })
    const pages = Math.max(1, Math.ceil(total / 15))
    return { items, total, page: pageNum, pages }
  })

  // CSV export — routes + orders for this store, optionally filtered by date range
  app.get('/routes/export', { preHandler: [requireStoreUser, requireScope('routes:export')] }, async (req, reply) => {
    const { rows: feat } = await db.query(`
      SELECT 1 FROM store_features_enabled sfe
      JOIN features f ON f.id = sfe.feature_id
      WHERE sfe.store_id = $1 AND f.name = 'csv_export'
    `, [req.actor.storeId])
    if (!feat.length) return reply.code(403).send({ error: 'Feature csv_export não habilitada' })

    const { from, to, delivererId } = req.query as { from?: string; to?: string; delivererId?: string }

    const params: unknown[] = [req.actor.storeId]
    const dateFilters: string[] = []
    if (delivererId) { params.push(delivererId); dateFilters.push(`r.deliverer_id = $${params.length}`) }
    if (from)        { params.push(from);        dateFilters.push(`r.created_at >= $${params.length}::date`) }
    if (to)          { params.push(to);          dateFilters.push(`r.created_at <  ($${params.length}::date + interval '1 day')`) }
    const where = dateFilters.length ? `AND ${dateFilters.join(' AND ')}` : ''

    const { rows } = await db.query(`
      SELECT
        o.id                    AS order_id,
        r.id                    AS route_id,
        d.name                  AS deliverer_name,
        o.delivery_address      AS delivery_address,
        o.status,
        o.created_at,
        o.picked_up_at,
        o.delivered_at
      FROM routes r
      JOIN deliverers d ON d.id = r.deliverer_id
      JOIN orders     o ON o.route_id = r.id
      WHERE r.store_id = $1 ${where}
      ORDER BY r.created_at DESC, o.route_position ASC NULLS LAST
    `, params)

    return (rows as Record<string, unknown>[]).map(o => ({
      orderId:         o.order_id,
      routeId:         o.route_id,
      delivererName:   o.deliverer_name,
      deliveryAddress: o.delivery_address,
      status:          o.status,
      createdAt:       o.created_at,
      pickedUpAt:      o.picked_up_at  ?? null,
      deliveredAt:     o.delivered_at  ?? null,
    }))
  })

  app.get('/routes/:id', { preHandler: requireStoreUser }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const route = await routeRepo.findById(id, req.actor.storeId)
    if (!route) return reply.code(404).send({ error: 'Not found' })
    return route
  })

  // GET /routes/:id/map-data — order pins + deliverer trail for the map
  app.get('/routes/:id/map-data', { preHandler: requireStoreUser }, async (req, reply) => {
    const { id } = req.params as { id: string }

    // Verify route belongs to store
    const { rows: [routeRow] } = await db.query(
      `SELECT r.deliverer_id, r.created_at, r.finished_at
       FROM routes r WHERE r.id = $1 AND r.store_id = $2`,
      [id, req.actor.storeId]
    )
    if (!routeRow) return reply.code(404).send({ error: 'Not found' })
    const { deliverer_id, created_at, finished_at } = routeRow as {
      deliverer_id: string
      created_at:   Date
      finished_at:  Date | null
    }

    // Order pins with customer coordinates
    const { rows: orderRows } = await db.query(
      `SELECT o.id, o.status, o.route_position,
              c.name    AS customer_name,
              COALESCE(o.delivery_lat, ca.lat) AS lat,
              COALESCE(o.delivery_lng, ca.lng) AS lng
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true
       WHERE o.route_id = $1
       ORDER BY o.route_position ASC NULLS LAST, o.created_at ASC`,
      [id]
    )

    // Deliverer trail between route created_at and finished_at (or now)
    const { rows: trailRows } = await db.query(
      `SELECT lat, lng, recorded_at
       FROM location_history
       WHERE deliverer_id = $1
         AND recorded_at >= $2
         AND recorded_at <= COALESCE($3, now())
       ORDER BY recorded_at ASC`,
      [deliverer_id, created_at, finished_at]
    )

    return {
      orders: (orderRows as Record<string, unknown>[]).map(o => ({
        id:            o.id,
        customerName:  o.customer_name,
        status:        o.status,
        routePosition: o.route_position,
        lat:           o.lat,
        lng:           o.lng,
      })),
      trail: (trailRows as { lat: number; lng: number; recorded_at: Date }[]).map(p => ({
        lat:         p.lat,
        lng:         p.lng,
        recorded_at: p.recorded_at.toISOString(),
      })),
    }
  })

  app.patch(
    '/routes/:id/status',
    { preHandler: [requireStoreUser, requireScope('routes:force_finish')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { status } = z.object({
        status: z.enum(['CREATED', 'STARTED', 'FINISHED']),
      }).parse(req.body)
      const route = await routeRepo.updateStatus(id, req.actor.storeId, status)
      if (!route) return reply.code(404).send({ error: 'Not found' })
      logRouteEvent(id, req.actor, status, { trigger: 'forced' })
      return route
    }
  )

  // Edit a CREATED route: reorder existing orders and/or add new (unassigned) ones.
  // Body is the FULL ordered list of order IDs (kept + new). Editing cannot remove orders.
  app.patch(
    '/routes/:id/orders',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { orderIds } = z.object({
        orderIds: z.array(z.string().uuid()).min(1),
      }).parse(req.body)

      // Route must exist, belong to the store, and still be editable (not started)
      const { rows: [routeRow] } = await db.query(
        `SELECT id, deliverer_id, status FROM routes WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!routeRow) return reply.code(404).send({ error: 'Rota não encontrada' })
      if (routeRow.status !== 'CREATED') {
        return reply.code(400).send({ error: 'Só é possível editar rotas que ainda não foram iniciadas' })
      }
      const delivererId = routeRow.deliverer_id as string

      // Current orders in the route
      const { rows: currentRows } = await db.query(
        `SELECT id, status FROM orders WHERE route_id = $1`,
        [id]
      )
      const currentIds  = currentRows.map(r => r.id as string)
      const currentSet  = new Set(currentIds)
      const statusById  = new Map<string, string>(currentRows.map(r => [r.id as string, r.status as string]))

      // Editing reorders/adds — it must keep every existing order
      for (const cid of currentIds) {
        if (!orderIds.includes(cid)) {
          return reply.code(400).send({ error: 'Não é permitido remover pedidos da rota' })
        }
      }

      // New orders = present in the payload but not yet in the route
      const newIds  = orderIds.filter(oid => !currentSet.has(oid))
      const newSet  = new Set(newIds)

      // Validate each new order: must be an unassigned order of this store
      for (const oid of newIds) {
        const { rows: [o] } = await db.query(
          `SELECT id, status, route_id FROM orders WHERE id = $1 AND store_id = $2`,
          [oid, req.actor.storeId]
        )
        if (!o) return reply.code(404).send({ error: `Pedido ${oid} não encontrado` })
        if (o.route_id) return reply.code(409).send({ error: `Pedido ${oid} já está em uma rota` })
        if (!canTransition(o.status as OrderStatus, 'ASSIGNED')) {
          return reply.code(409).send({ error: `Pedido ${oid} não pode ser adicionado (status: ${o.status})` })
        }
      }

      // Position constraint: a new order cannot sit before a finished (DELIVERED/CANCELLED) order
      let maxLockedIndex = -1
      orderIds.forEach((oid, i) => {
        const st = statusById.get(oid)
        if (st === 'DELIVERED' || st === 'CANCELLED') maxLockedIndex = i
      })
      for (let i = 0; i < orderIds.length; i++) {
        if (newSet.has(orderIds[i]) && i <= maxLockedIndex) {
          return reply.code(409).send({ error: 'Novos pedidos não podem ser inseridos antes de pedidos já concluídos' })
        }
      }

      // Apply: attach new orders, then renumber positions in the requested order
      await db.transaction(async (client) => {
        for (const oid of newIds) {
          await client.query(
            `UPDATE orders SET deliverer_id = $2, route_id = $3, status = 'ASSIGNED' WHERE id = $1`,
            [oid, delivererId, id]
          )
        }
        for (let i = 0; i < orderIds.length; i++) {
          await client.query(
            `UPDATE orders SET route_position = $1 WHERE id = $2 AND route_id = $3`,
            [i + 1, orderIds[i], id]
          )
        }
      })

      // Broadcast updates + notify customers of newly-assigned orders
      const updatedOrders = await orderRepo.findByRoute(id)
      for (const o of updatedOrders) {
        wsHub.broadcastOrderUpdate(req.actor.storeId, o)
      }
      for (const oid of newIds) {
        queueNotif(req.actor.storeId, oid, 'ASSIGNED')
        orderRepo.appendLog(oid, {
          at: new Date().toISOString(),
          by: { type: 'store_user', id: req.actor.sub, name: req.actor.name },
          action: 'ASSIGNED',
          details: { delivererId, routeId: id },
        }).catch(() => { /* non-fatal */ })
        logRouteEvent(id, req.actor, 'ORDER_ADDED', { orderId: oid })
      }

      // Notify the deliverer (push) that the route changed
      queuePush(delivererId, orderIds[0], req.actor.storeId, 'ROUTE_UPDATED')

      // Invalidate the deliverer's order cache so the app re-fetches the new order
      try { await redis.del(`orders:deliverer:${delivererId}`) } catch { /* non-fatal */ }

      const route = await routeRepo.findById(id, req.actor.storeId)
      return { route }
    }
  )

  // ── Deliverer routes ──────────────────────────────────────────────────────
  // Hard-delete a route AND all its orders (store admin, scope-gated)
  app.delete(
    '/routes/:id',
    { preHandler: [requireStoreUser, requireScope('routes:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { rows: [route] } = await db.query(
        `SELECT id FROM routes WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!route) return reply.code(404).send({ error: 'Rota não encontrada' })

      const { rowCount: deletedOrders } = await db.query(
        `DELETE FROM orders WHERE route_id = $1`,
        [id]
      )
      await db.query(`DELETE FROM routes WHERE id = $1`, [id])

      return { ok: true, deletedOrders: deletedOrders ?? 0 }
    }
  )

  app.get('/deliverer/routes', { preHandler: requireDeliverer }, async (req) => {
    return routeRepo.findByDeliverer(req.actor.sub)
  })

  app.get('/deliverer/routes/:id', { preHandler: requireDeliverer }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `SELECT id, store_id, pickup_code, status FROM routes WHERE id = $1 AND deliverer_id = $2`,
      [id, req.actor.sub]
    )
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' })
    const r = rows[0] as Record<string, unknown>

    const orders = await orderRepo.findByRoute(id)
    return {
      id:         r.id,
      storeId:    r.store_id,
      pickupCode: r.pickup_code,
      status:     r.status,
      orders,
    }
  })

  // Cancel a CREATED route (deliverer self-service) — resets orders to PREPARING
  app.delete('/deliverer/routes/:id', { preHandler: requireDeliverer }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows } = await db.query(
      `SELECT id, status FROM routes WHERE id = $1 AND deliverer_id = $2`,
      [id, req.actor.sub]
    )
    const route = rows[0] as Record<string, unknown> | undefined
    if (!route) return reply.code(404).send({ error: 'Not found' })
    if (route.status !== 'CREATED') {
      return reply.code(400).send({ error: 'Só é possível cancelar rotas que ainda não foram iniciadas' })
    }

    await db.query(
      `UPDATE orders SET status = 'PREPARING', deliverer_id = NULL, route_id = NULL, route_position = NULL
       WHERE route_id = $1`,
      [id]
    )
    await db.query('DELETE FROM routes WHERE id = $1', [id])

    return { ok: true }
  })

  // Confirm route pickup with ONE code — transitions all ASSIGNED orders to ON_ROUTE
  app.post(
    '/deliverer/routes/:id/pickup',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { code } = z.object({ code: z.string().default('') }).parse(req.body)

      const { rows } = await db.query(
        `SELECT * FROM routes WHERE id = $1 AND deliverer_id = $2`,
        [id, req.actor.sub]
      )
      const route = rows[0] as Record<string, unknown> | undefined
      if (!route) return reply.code(404).send({ error: 'Not found' })
      if (route.status === 'FINISHED') return reply.code(400).send({ error: 'Route already finished' })

      const { rows: [settingRow] } = await db.query(
        `SELECT COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
         WHERE s.name = 'require_pickup_code'`,
        [route.store_id]
      )
      const requirePickupCode = (settingRow as Record<string, unknown> | undefined)?.value !== 'false'

      if (requirePickupCode && (route.pickup_code as string) !== code.toUpperCase()) {
        return reply.code(400).send({ error: 'Código inválido' })
      }

      const { rows: pickedRows } = await db.query(
        `UPDATE orders SET status = 'ON_ROUTE', picked_up_at = now()
         WHERE route_id = $1 AND status = 'ASSIGNED'
         RETURNING id`,
        [id]
      )

      // Auditoria: registra a retirada de cada pedido efetivamente movido.
      const pickedBy = { type: 'deliverer' as const, id: req.actor.sub, name: req.actor.name }
      for (const r of pickedRows as { id: string }[]) {
        orderRepo.appendLog(r.id, { at: new Date().toISOString(), by: pickedBy, action: 'PICKED_UP' })
          .catch(() => { /* non-fatal */ })
      }

      await routeRepo.updateStatus(id, route.store_id as string, 'STARTED')
      logRouteEvent(id, req.actor, 'STARTED', { pickedUp: pickedRows.length })

      const orders = await orderRepo.findByRoute(id)

      // Auto-avanço: a 1ª parada da rota (menor route_position ainda ON_ROUTE)
      // já entra em OUT_FOR_DELIVERY; as demais permanecem ON_ROUTE.
      let firstAdvanced = false
      for (const o of orders) {
        if (!firstAdvanced && o.status === 'ON_ROUTE') {
          firstAdvanced = true
          // Idempotente: só notifica se ESTE chamada moveu o pedido de ON_ROUTE,
          // evitando duplicar a mensagem caso o start por pedido também dispare.
          const advanced = await orderRepo.transitionToOutForDelivery(o.id)
          if (!advanced) continue
          orderRepo.appendLog(o.id, {
            at:     new Date().toISOString(),
            by:     { type: 'system' },
            action: 'OUT_FOR_DELIVERY',
            details: { trigger: 'route_auto_advance' },
          }).catch(() => { /* non-fatal */ })
          const updated = await orderRepo.findById(o.id, route.store_id as string)
          wsHub.broadcastOrderUpdate(route.store_id as string, updated ?? o)
          queueNotif(route.store_id as string, o.id, 'OUT_FOR_DELIVERY')
          continue
        }
        wsHub.broadcastOrderUpdate(route.store_id as string, o)
        queueNotif(route.store_id as string, o.id, 'ON_ROUTE')
      }

      return { ok: true, orders: await orderRepo.findByRoute(id) }
    }
  )

  // ── Report route issue (deliverer mobile) ────────────────────────────────
  app.post(
    '/deliverer/routes/:id/issues',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { category, description, orderId } = z.object({
        category:    z.enum(['ADDRESS_NOT_FOUND', 'ACCESS_BLOCKED', 'CUSTOMER_UNAVAILABLE', 'WRONG_ADDRESS', 'DAMAGED_PACKAGE', 'OTHER']),
        description: z.string().trim().max(500).default(''),
        orderId:     z.string().uuid(),
      }).parse(req.body)

      // Verificar que a rota existe e pertence ao entregador
      const { rows } = await db.query(
        `SELECT id, store_id FROM routes WHERE id = $1 AND deliverer_id = $2`,
        [id, req.actor.sub]
      )
      if (!rows[0]) return reply.code(404).send({ error: 'Rota não encontrada' })

      const route = rows[0] as { id: string; store_id: string }

      // Validar que o pedido pertence à rota
      const { rows: orderRows } = await db.query(
        `SELECT id FROM orders WHERE id = $1 AND route_id = $2`,
        [orderId, id]
      )
      if (!orderRows[0]) return reply.code(404).send({ error: 'Pedido não pertence a esta rota' })

      const issue = {
        id:          crypto.randomUUID(),
        category,
        description,
        orderId:     orderId ?? undefined,
        reportedBy:  { id: req.actor.sub, name: req.actor.name },
        reportedAt:  new Date().toISOString(),
      }

      await routeRepo.appendIssue(id, issue)

      // Auditoria
      logRouteEvent(id, req.actor, 'ISSUE_REPORTED', { issueId: issue.id, category, orderId })

      // Broadcast: loja vê a atualização em tempo real
      const updatedRoute = await routeRepo.findById(id, route.store_id)
      if (updatedRoute) {
        wsHub.broadcastOrderUpdate(route.store_id, { routeId: id, issues: updatedRoute.issues } as any)
      }

      return { ok: true, issue }
    }
  )

}
