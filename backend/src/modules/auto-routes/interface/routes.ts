import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgAutoRouteRepo } from '../infrastructure/repositories/pg-auto-route-repo'

const autoRouteRepo = createPgAutoRouteRepo(db)

// Defaults quando a loja ainda não configurou (nenhuma linha em config).
const DEFAULT_CONFIG = { enabled: false, waitMinutes: 15, queueSize: 5, maxOrders: null as number | null }

const upsertSchema = z.object({
  enabled:      z.boolean(),
  waitMinutes:  z.number().int().min(1).max(720),
  queueSize:    z.number().int().min(1).max(100),
  maxOrders:    z.number().int().min(1).max(100).nullable().optional(),
  delivererIds: z.array(z.string().uuid()),
})

export async function autoRouteRoutes(app: FastifyInstance) {
  // GET — config atual + rodízio (com nome/status de cada entregador)
  app.get(
    '/store/auto-routes/config',
    { preHandler: [requireStoreUser, requireScope('routes:auto_config')] },
    async (req) => {
      const storeId = req.actor.storeId
      const [config, rodizio] = await Promise.all([
        autoRouteRepo.getConfig(storeId),
        autoRouteRepo.getRodizio(storeId),
      ])
      return {
        config: config
          ? {
              enabled:     config.enabled,
              waitMinutes: config.waitMinutes,
              queueSize:   config.queueSize,
              maxOrders:   config.maxOrders,
            }
          : DEFAULT_CONFIG,
        rodizio: rodizio.map(r => ({
          delivererId: r.delivererId,
          name:        r.name,
          status:      r.status,
          isActive:    r.isActive,
        })),
      }
    }
  )

  // PUT — upsert da config + rodízio (transacional, com auditoria antes/depois)
  app.put(
    '/store/auto-routes/config',
    { preHandler: [requireStoreUser, requireScope('routes:auto_config')] },
    async (req, reply) => {
      const body = upsertSchema.parse(req.body)
      const storeId = req.actor.storeId

      // Valida que o rodízio só contém entregadores ativos desta loja.
      if (body.delivererIds.length > 0) {
        const { rows } = await db.query<{ id: string }>(
          `SELECT id FROM deliverers
           WHERE store_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
          [storeId, body.delivererIds]
        )
        const valid = new Set(rows.map(r => r.id))
        const invalid = body.delivererIds.filter(id => !valid.has(id))
        if (invalid.length > 0) {
          return reply.code(400).send({ error: 'Rodízio contém entregadores inválidos para esta loja' })
        }
        // Rejeita duplicados no rodízio (a mesma pessoa não pode ocupar 2 posições).
        if (new Set(body.delivererIds).size !== body.delivererIds.length) {
          return reply.code(400).send({ error: 'Rodízio tem entregadores duplicados' })
        }
      }

      // Ativar exige pelo menos um entregador no rodízio.
      if (body.enabled && body.delivererIds.length === 0) {
        return reply.code(400).send({ error: 'Adicione ao menos um entregador ao rodízio para ativar' })
      }

      const config = await autoRouteRepo.upsertConfig(
        storeId,
        {
          enabled:      body.enabled,
          waitMinutes:  body.waitMinutes,
          queueSize:    body.queueSize,
          maxOrders:    body.maxOrders ?? null,
          delivererIds: body.delivererIds,
        },
        { id: req.actor.sub, name: req.actor.name ?? '' },
      )

      return {
        config: {
          enabled:     config.enabled,
          waitMinutes: config.waitMinutes,
          queueSize:   config.queueSize,
          maxOrders:   config.maxOrders,
        },
      }
    }
  )
}
