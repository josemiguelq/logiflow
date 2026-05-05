import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { createPgOrderRepo } from '../infrastructure/repositories/pg-order-repo'
import { createOrder } from '../application/use-cases/create-order'
import { assignDeliverer } from '../application/use-cases/assign-deliverer'
import { confirmPickup } from '../application/use-cases/confirm-pickup'
import { confirmDelivery } from '../application/use-cases/confirm-delivery'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'

export async function orderRoutes(app: FastifyInstance) {
  const orderRepo = createPgOrderRepo(db)

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
      const filters = {
        status:          status as string | undefined,
        delivererId,
        createdByUserId: req.actor.role === 'ASSISTANT' ? req.actor.sub : undefined,
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
    customerId: z.string().uuid(),
    notes:      z.string().optional(),
    lat:        z.number().optional(),
    lng:        z.number().optional(),
  })

  app.post(
    '/orders',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const body = createSchema.parse(req.body)
      const actor = req.actor
      const storeId = actor.storeId

      const order = await createOrder(
        { storeId, customerId: body.customerId, createdByUserId: actor.sub, ...body },
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
      try {
        const order = await assignDeliverer(
          { orderId: id, storeId: req.actor.storeId, ...body },
          { orderRepo }
        )
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        return order
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message })
      }
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

  // ── Deliverer routes ─────────────────────────────────────────────────────
  app.get(
    '/deliverer/orders',
    { preHandler: requireDeliverer },
    async (req) => orderRepo.findByDeliverer(req.actor.sub)
  )

  const pickupSchema   = z.object({ code: z.string().length(5) })
  const deliverySchema = z.object({
    code:     z.string().length(5),
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
      try {
        const order = await confirmDelivery(
          { orderId: id, storeId: req.actor.storeId, delivererId: req.actor.sub, ...body },
          { orderRepo }
        )
        wsHub.broadcastOrderUpdate(req.actor.storeId, order)
        return order
      } catch (err: unknown) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    }
  )

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
