import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireDeliverer, requireStoreUser } from '../../../shared/middleware/auth'
import { createPgTrackingRepo } from '../infrastructure/repositories/pg-tracking-repo'
import { wsHub } from '../../../shared/infra/websocket'

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

export async function trackingRoutes(app: FastifyInstance) {
  const repo = createPgTrackingRepo(db)

  // Deliverer sends location
  app.post(
    '/tracking/location',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { lat, lng } = locationSchema.parse(req.body)
      const saved = await repo.recordLocation(req.actor.sub, lat, lng)
      if (saved) {
        wsHub.broadcastDelivererLocation(req.actor.storeId, req.actor.sub, lat, lng)
      }
      return reply.send({ saved })
    }
  )

  // Store user gets latest position of a deliverer
  app.get(
    '/tracking/deliverer/:delivererId/latest',
    { preHandler: requireStoreUser },
    async (req) => {
      const { delivererId } = req.params as { delivererId: string }
      return repo.getLatest(delivererId)
    }
  )

  app.get(
    '/tracking/deliverer/:delivererId/history',
    { preHandler: requireStoreUser },
    async (req) => {
      const { delivererId } = req.params as { delivererId: string }
      const { since } = req.query as { since?: string }
      return repo.getHistory(delivererId, since ? new Date(since) : undefined)
    }
  )
}
