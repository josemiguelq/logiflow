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

export async function orderRoutes(app: FastifyInstance) {
  const orderRepo = createPgOrderRepo(db)
  const routeRepo = createPgRouteRepo(db)

  // ── Public tracking (no auth) ────────────────────────────────────────────
  app.get('/tracking/:orderId', async (req, reply) => {
    const { orderId } = req.params as { orderId: string }
    const order = await orderRepo.getPublic(orderId)
    if (!order) return reply.code(404).send({ error: 'Not found' })
    return order
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
      return orderRepo.findByStore(req.actor.storeId, filters)
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
        {
          orderRepo,
          notifyCustomer: async (orderId) => {
            await notificationQueue.add('order_created', {
              type:    'whatsapp',
              storeId,
              orderId,
              phone:   '',
              message: '',
            })
          },
        }
      )

      wsHub.broadcastOrderUpdate(storeId, order)
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
    async (req) => orderRepo.findByDeliverer(req.actor.sub)
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
      }

      return { route, orders: claimedOrders }
    }
  )

  const pickupSchema   = z.object({ code: z.string().length(5) })
  const deliverySchema = z.object({
    code:     z.string().default(''),
    photoUrl: z.string().url().optional(),
    lat:      z.number().optional(),
    lng:      z.number().optional(),
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

      const { rows: [settings] } = await db.query(
        'SELECT require_delivery_code FROM store_settings WHERE store_id = $1',
        [req.actor.storeId]
      )
      const requireDeliveryCode = (settings?.require_delivery_code ?? true) as boolean

      try {
        const order = await confirmDelivery(
          { orderId: id, storeId: req.actor.storeId, delivererId: req.actor.sub,
            requireDeliveryCode, ...body },
          { orderRepo }
        )
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)

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
      return updated
    }
  )
}
