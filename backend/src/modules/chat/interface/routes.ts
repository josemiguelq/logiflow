import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgChatRepo } from '../infrastructure/repositories/pg-chat-repo'
import { OrderMessage } from '../domain/entities'
import { wsHub } from '../../../shared/infra/websocket'
import { notificationQueue } from '../../../shared/infra/queue'

const bodySchema = z.object({ body: z.string().trim().min(1).max(2000) })

// Push direcionado ao entregador do pedido (worker resolve tokens por delivererId).
const queuePushDeliverer = (delivererId: string, storeId: string, orderId: string) =>
  notificationQueue.add('push', { type: 'push', delivererId, storeId, orderId, statusEvent: 'NEW_MESSAGE' })
    .catch(() => { /* non-fatal */ })

// JSON leve p/ o cliente (Date → ISO pelo Fastify).
const serialize = (m: OrderMessage) => ({
  id:         m.id,
  orderId:    m.orderId,
  senderType: m.senderType,
  senderId:   m.senderId,
  senderName: m.senderName,
  body:       m.body,
  createdAt:  m.createdAt,
  // Quem leu esta mensagem (operadores da loja).
  reads:      m.reads.map(r => ({
    storeUserId:   r.storeUserId,
    storeUserName: r.storeUserName,
    readAt:        r.readAt,
  })),
})

export async function chatRoutes(app: FastifyInstance) {
  const chatRepo = createPgChatRepo(db)

  // ── Operador (painel) ──────────────────────────────────────────────────────
  app.get(
    '/orders/chat/unread',
    { preHandler: [requireStoreUser, requireScope('orders:view')] },
    async (req) => chatRepo.unreadByStore(req.actor.storeId),
  )

  app.get(
    '/orders/:orderId/chat',
    { preHandler: [requireStoreUser, requireScope('orders:view')] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      const ctx = await chatRepo.findOrderContext(orderId, storeId)
      if (!ctx) return reply.code(404).send({ error: 'order_not_found' })
      const messages = await chatRepo.listByOrder(orderId, storeId)
      return messages.map(serialize)
    },
  )

  app.post(
    '/orders/:orderId/chat',
    { preHandler: [requireStoreUser, requireScope('orders:view')] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      const parsed = bodySchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' })

      const ctx = await chatRepo.findOrderContext(orderId, storeId)
      if (!ctx) return reply.code(404).send({ error: 'order_not_found' })
      // Sem entregador atribuído não há destinatário — a mensagem não chegaria a ninguém.
      if (!ctx.delivererId) return reply.code(409).send({ error: 'no_deliverer' })

      const msg = await chatRepo.create({
        orderId, storeId, delivererId: ctx.delivererId,
        senderType: 'store_user', senderId: req.actor.sub, senderName: req.actor.name,
        body: parsed.data.body,
      })
      wsHub.broadcastOrderMessage(storeId, serialize(msg))
      if (ctx.delivererId) queuePushDeliverer(ctx.delivererId, storeId, orderId)
      return reply.code(201).send(serialize(msg))
    },
  )

  app.post(
    '/orders/:orderId/chat/read',
    { preHandler: [requireStoreUser, requireScope('orders:view')] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      await chatRepo.markReadByStore(orderId, storeId, req.actor.sub, req.actor.name)
      // Sincroniza o badge de não-lidas entre operadores da mesma loja.
      wsHub.broadcastToStore(storeId, 'order_message_read', { orderId })
      return reply.send({ ok: true })
    },
  )

  // ── Entregador (app) ───────────────────────────────────────────────────────
  // Só pode acessar o chat de pedidos que já pegou (deliverer_id === ele).
  app.get(
    '/deliverer/orders/:orderId/chat',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      const ctx = await chatRepo.findOrderContext(orderId, storeId)
      if (!ctx) return reply.code(404).send({ error: 'order_not_found' })
      if (ctx.delivererId !== req.actor.sub) return reply.code(403).send({ error: 'not_your_order' })
      const messages = await chatRepo.listByOrder(orderId, storeId)
      return messages.map(serialize)
    },
  )

  app.post(
    '/deliverer/orders/:orderId/chat',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      const parsed = bodySchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_body' })

      const ctx = await chatRepo.findOrderContext(orderId, storeId)
      if (!ctx) return reply.code(404).send({ error: 'order_not_found' })
      if (ctx.delivererId !== req.actor.sub) return reply.code(403).send({ error: 'not_your_order' })

      const msg = await chatRepo.create({
        orderId, storeId, delivererId: req.actor.sub,
        senderType: 'deliverer', senderId: req.actor.sub, senderName: req.actor.name,
        body: parsed.data.body,
      })
      // Operadores da loja recebem a mensagem em tempo real no painel.
      wsHub.broadcastOrderMessage(storeId, serialize(msg))
      return reply.code(201).send(serialize(msg))
    },
  )

  app.post(
    '/deliverer/orders/:orderId/chat/read',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string }
      const storeId = req.actor.storeId
      const ctx = await chatRepo.findOrderContext(orderId, storeId)
      if (!ctx) return reply.code(404).send({ error: 'order_not_found' })
      if (ctx.delivererId !== req.actor.sub) return reply.code(403).send({ error: 'not_your_order' })
      await chatRepo.markReadByDeliverer(orderId)
      return reply.send({ ok: true })
    },
  )
}
