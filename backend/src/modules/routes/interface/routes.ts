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
    return routeRepo.findByStore(req.actor.storeId)
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
      `SELECT r.deliverer_id, r.started_at, r.finished_at
       FROM routes r WHERE r.id = $1 AND r.store_id = $2`,
      [id, req.actor.storeId]
    )
    if (!routeRow) return reply.code(404).send({ error: 'Not found' })
    const { deliverer_id, started_at, finished_at } = routeRow as {
      deliverer_id: string
      started_at:   Date | null
      finished_at:  Date | null
    }

    // Order pins with customer coordinates
    const { rows: orderRows } = await db.query(
      `SELECT o.id, o.status, o.route_position,
              c.name    AS customer_name,
              COALESCE(c.lat, NULL) AS lat,
              COALESCE(c.lng, NULL) AS lng
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.route_id = $1
       ORDER BY o.route_position ASC NULLS LAST, o.created_at ASC`,
      [id]
    )

    // Deliverer trail between route started_at and finished_at (or now)
    const { rows: trailRows } = started_at
      ? await db.query(
          `SELECT lat, lng
           FROM location_history
           WHERE deliverer_id = $1
             AND recorded_at >= $2
             AND recorded_at <= COALESCE($3, now())
           ORDER BY recorded_at ASC`,
          [deliverer_id, started_at, finished_at]
        )
      : { rows: [] }

    return {
      orders: (orderRows as Record<string, unknown>[]).map(o => ({
        id:            o.id,
        customerName:  o.customer_name,
        status:        o.status,
        routePosition: o.route_position,
        lat:           o.lat,
        lng:           o.lng,
      })),
      trail: (trailRows as { lat: number; lng: number }[]).map(p => ({
        lat: p.lat,
        lng: p.lng,
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

      const { rows: [settings] } = await db.query(
        'SELECT require_pickup_code FROM store_settings WHERE store_id = $1',
        [route.store_id]
      )
      const requirePickupCode = (settings?.require_pickup_code ?? true) as boolean

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
