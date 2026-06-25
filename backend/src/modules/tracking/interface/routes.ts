import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireDeliverer, requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgTrackingRepo } from '../infrastructure/repositories/pg-tracking-repo'
import { wsHub } from '../../../shared/infra/websocket'

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
})

const batchSchema = z.object({
  points: z.array(z.object({
    lat:        z.number(),
    lng:        z.number(),
    recordedAt: z.string().datetime(),
  })).min(1).max(5000),
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

  // Deliverer flushes queued locations (offline store-and-forward)
  app.post(
    '/tracking/location/batch',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { points } = batchSchema.parse(req.body)
      const parsed = points.map(p => ({ ...p, recordedAt: new Date(p.recordedAt) }))
      const saved = await repo.recordBatch(req.actor.sub, parsed)
      if (saved > 0) {
        const last = parsed[parsed.length - 1]!
        wsHub.broadcastDelivererLocation(req.actor.storeId, req.actor.sub, last.lat, last.lng)
      }
      return reply.send({ saved })
    }
  )

  // Garante que o entregador pertence à loja do solicitante antes de expor
  // qualquer dado de localização (isolamento entre lojas).
  async function assertDelivererInStore(delivererId: string, storeId: string): Promise<boolean> {
    const { rows } = await db.query(
      'SELECT 1 FROM deliverers WHERE id = $1 AND store_id = $2',
      [delivererId, storeId]
    )
    return rows.length > 0
  }

  // Seed do mapa da frota: para cada entregador ativo da loja, os ÚLTIMOS 25
  // pontos (em ordem cronológica) já formando o tracejado. Entregadores sem
  // nenhum registro são omitidos (JOIN LATERAL + ON points IS NOT NULL).
  // Uma única query (sem N+1); coberta por idx_location_deliverer_time.
  app.get(
    '/tracking/deliverers/latest',
    { preHandler: [requireStoreUser, requireScope('deliverers:track')] },
    async (req) => {
      const { rows } = await db.query(
        `SELECT d.id AS deliverer_id, d.name, d.status, lh.points
         FROM deliverers d
         JOIN LATERAL (
           SELECT json_agg(
                    json_build_object('lat', last25.lat, 'lng', last25.lng, 'recorded_at', last25.recorded_at)
                    ORDER BY last25.recorded_at ASC
                  ) AS points
           FROM (
             SELECT lat, lng, recorded_at
             FROM location_history
             WHERE deliverer_id = d.id
             ORDER BY recorded_at DESC
             LIMIT 25
           ) last25
         ) lh ON lh.points IS NOT NULL
         WHERE d.store_id = $1 AND d.is_active = true AND d.deleted_at IS NULL
         ORDER BY d.name ASC`,
        [req.actor.storeId]
      )
      return rows
    }
  )

  // Store user gets latest position of a deliverer
  app.get(
    '/tracking/deliverer/:delivererId/latest',
    { preHandler: [requireStoreUser, requireScope('deliverers:track')] },
    async (req, reply) => {
      const { delivererId } = req.params as { delivererId: string }
      if (!await assertDelivererInStore(delivererId, req.actor.storeId)) {
        return reply.code(404).send({ error: 'Entregador não encontrado' })
      }
      return repo.getLatest(delivererId)
    }
  )

  app.get(
    '/tracking/deliverer/:delivererId/history',
    { preHandler: [requireStoreUser, requireScope('deliverers:track')] },
    async (req, reply) => {
      const { delivererId } = req.params as { delivererId: string }
      if (!await assertDelivererInStore(delivererId, req.actor.storeId)) {
        return reply.code(404).send({ error: 'Entregador não encontrado' })
      }
      const { from, to } = z.object({
        from: z.string().optional(),
        to:   z.string().optional(),
      }).parse(req.query)

      const now      = new Date()
      const fromDate = from ? new Date(`${from}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const toDate   = to   ? new Date(`${to}T23:59:59`)   : now

      return repo.getHistory(delivererId, fromDate, toDate)
    }
  )
}
