import { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createBaileysProvider } from '../infrastructure/baileys/baileys-provider'

export async function notificationRoutes(app: FastifyInstance) {
  const whatsapp = createBaileysProvider(db)

  app.get(
    '/whatsapp/status',
    { preHandler: [requireStoreUser, requireScope('whatsapp:view')] },
    async (req) => ({ status: await whatsapp.getStatus(req.actor.storeId) })
  )

  app.post(
    '/whatsapp/connect',
    { preHandler: [requireStoreUser, requireScope('whatsapp:connect')] },
    async (req, reply) => {
      await whatsapp.connect(req.actor.storeId)
      await new Promise((res) => setTimeout(res, 3_000))
      const qr = await whatsapp.getQRCode(req.actor.storeId)
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr)
        return reply.send({ status: 'CONNECTING', qrCode: dataUrl })
      }
      const status = await whatsapp.getStatus(req.actor.storeId)
      return reply.send({ status })
    }
  )

  app.get(
    '/whatsapp/qr',
    { preHandler: [requireStoreUser, requireScope('whatsapp:view')] },
    async (req, reply) => {
      const qr = await whatsapp.getQRCode(req.actor.storeId)
      if (!qr) return reply.code(404).send({ error: 'No QR available' })
      const dataUrl = await QRCode.toDataURL(qr)
      return { qrCode: dataUrl }
    }
  )

  app.post(
    '/whatsapp/disconnect',
    { preHandler: [requireStoreUser, requireScope('whatsapp:connect')] },
    async (req) => {
      await whatsapp.disconnect(req.actor.storeId)
      return { ok: true }
    }
  )
}
