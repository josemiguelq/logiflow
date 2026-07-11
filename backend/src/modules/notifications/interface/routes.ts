import { FastifyInstance } from 'fastify'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createCloudApiProvider } from '../infrastructure/cloud-api/cloud-api-provider'

// Fase 1: número central da LogiFlow (Cloud API oficial). Não há mais pareamento
// por QR — o status reflete apenas se o número central está configurado/ativo.
// (Os endpoints de connect/disconnect ficam como no-op compatível para não quebrar
// o frontend; o Embedded Signup por loja entra na fase 2.)
export async function notificationRoutes(app: FastifyInstance) {
  const whatsapp = createCloudApiProvider(db, app.log)

  app.get(
    '/whatsapp/status',
    { preHandler: [requireStoreUser, requireScope('whatsapp:view')] },
    async (req) => ({ status: await whatsapp.getStatus(req.actor.storeId), central: true })
  )

  app.post(
    '/whatsapp/connect',
    { preHandler: [requireStoreUser, requireScope('whatsapp:connect')] },
    async (req) => ({ status: await whatsapp.getStatus(req.actor.storeId), central: true })
  )

  app.post(
    '/whatsapp/disconnect',
    { preHandler: [requireStoreUser, requireScope('whatsapp:connect')] },
    async () => ({ ok: true })
  )
}
