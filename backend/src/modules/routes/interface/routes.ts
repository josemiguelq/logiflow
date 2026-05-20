import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgRouteRepo } from '../infrastructure/repositories/pg-route-repo'
import { createPgOrderRepo } from '../../orders/infrastructure/repositories/pg-order-repo'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'

const queueNotif = (storeId: string, orderId: string, statusEvent: string) =>
  notificationQueue.add('status_changed', { type: 'whatsapp', storeId, orderId, statusEvent })
    .catch(() => { /* non-fatal */ })

export async function routeRoutes(app: FastifyInstance) {
  const routeRepo = createPgRouteRepo(db)
  const orderRepo = createPgOrderRepo(db)

  // ── Store routes ──────────────────────────────────────────────────────────
  app.get('/routes', { preHandler: requireStoreUser }, async (req) => {
    const { page } = req.query as { page?: string }
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
    const { items, total } = await routeRepo.findByStore(req.actor.storeId, pageNum)
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

    const { from, to } = req.query as { from?: string; to?: string }

    const params: unknown[] = [req.actor.storeId]
    const dateFilters: string[] = []
    if (from) { params.push(from); dateFilters.push(`r.created_at >= $${params.length}::date`) }
    if (to)   { params.push(to);   dateFilters.push(`r.created_at <  ($${params.length}::date + interval '1 day')`) }
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
      return route
    }
  )

  // ── Deliverer routes ──────────────────────────────────────────────────────
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

      await db.query(
        `UPDATE orders SET status = 'ON_ROUTE', picked_up_at = now()
         WHERE route_id = $1 AND status = 'ASSIGNED'`,
        [id]
      )

      await routeRepo.updateStatus(id, route.store_id as string, 'STARTED')

      const orders = await orderRepo.findByRoute(id)
      for (const o of orders) {
        wsHub.broadcastOrderUpdate(route.store_id as string, o)
        queueNotif(route.store_id as string, o.id, 'ON_ROUTE')
      }

      return { ok: true, orders }
    }
  )

}
