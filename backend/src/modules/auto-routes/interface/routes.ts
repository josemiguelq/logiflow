import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgAutoRouteRepo } from '../infrastructure/repositories/pg-auto-route-repo'
import { createPgOrderRepo } from '../../orders/infrastructure/repositories/pg-order-repo'

const autoRouteRepo = createPgAutoRouteRepo(db)
const orderRepo     = createPgOrderRepo(db)

// A partir de startIdx, primeiro entregador elegível do rodízio (o "da vez"):
// online (ativo e não OFFLINE) E sem nenhuma rota ativa.
function firstEligibleFrom<T extends { eligible: boolean }>(list: T[], startIdx: number): { entry: T; idx: number } | null {
  const len = list.length
  for (let k = 0; k < len; k++) {
    const idx = (startIdx + k) % len
    if (list[idx].eligible) return { entry: list[idx], idx }
  }
  return null
}

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

  // POST — dry-run: simula o que o gatilho faria AGORA com a config informada
  // (ainda não salva), sem criar nada. Preview antes de salvar.
  app.post(
    '/store/auto-routes/dry-run',
    { preHandler: [requireStoreUser, requireScope('routes:auto_config')] },
    async (req) => {
      const body = upsertSchema.parse(req.body)
      const storeId = req.actor.storeId

      const preparing = await orderRepo.findPreparing(storeId)
      const now = Date.now()
      const waitOf = (o: { createdAt: Date }) => (now - new Date(o.createdAt).getTime()) / 60_000
      const maxWaitMinutes = preparing.reduce((m, o) => Math.max(m, waitOf(o)), 0)

      const triggerReasons: string[] = []
      if (preparing.length >= body.queueSize) triggerReasons.push('queue_size')
      if (maxWaitMinutes >= body.waitMinutes) triggerReasons.push('wait_minutes')
      const wouldTrigger = preparing.length > 0 && triggerReasons.length > 0

      // Status atual dos entregadores do rodízio (na ordem informada). Elegível =
      // online (ativo e não OFFLINE) E sem nenhuma rota ativa (CREATED/STARTED).
      let rodizio: { delivererId: string; name: string; eligible: boolean }[] = []
      if (body.delivererIds.length > 0) {
        const { rows } = await db.query<{ id: string; name: string; status: string; is_active: boolean; has_active_route: boolean }>(
          `SELECT id, name, status, is_active,
                  EXISTS (
                    SELECT 1 FROM routes r
                    WHERE r.deliverer_id = deliverers.id AND r.store_id = deliverers.store_id
                      AND r.status IN ('CREATED','STARTED')
                  ) AS has_active_route
           FROM deliverers
           WHERE store_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
          [storeId, body.delivererIds]
        )
        const byId = new Map(rows.map(r => [r.id, r]))
        rodizio = body.delivererIds.map(id => {
          const d = byId.get(id)
          return {
            delivererId: id,
            name:        d?.name ?? '—',
            eligible:    !!d && d.is_active && d.status !== 'OFFLINE' && !d.has_active_route,
          }
        })
      }

      // "Entregador da vez" a partir do ponteiro salvo (se houver), na ordem informada.
      const saved = await autoRouteRepo.getConfig(storeId)
      const len = rodizio.length
      const startIdx = len > 0 ? (((saved?.turnPosition ?? 0) % len) + len) % len : 0
      const daVezPick = len > 0 ? firstEligibleFrom(rodizio, startIdx) : null
      const noEligibleDeliverer = len > 0 && daVezPick === null

      const cap = body.maxOrders ?? preparing.length
      const willAssign = wouldTrigger && daVezPick ? preparing.slice(0, cap) : []
      const overflowCount = wouldTrigger && daVezPick ? Math.max(0, preparing.length - willAssign.length) : 0

      return {
        wouldTrigger,
        triggerReasons,
        preparingCount:  preparing.length,
        maxWaitMinutes:  Math.floor(maxWaitMinutes),
        daVez:           daVezPick ? { delivererId: daVezPick.entry.delivererId, name: daVezPick.entry.name } : null,
        noEligibleDeliverer,
        overflowCount,
        orders: willAssign.map(o => ({
          id:           o.id,
          shortId:      '#' + o.id.slice(-8).toUpperCase(),
          customerName: o.customer.name,
          address:      o.deliveryAddress ?? o.customer.address,
          waitMinutes:  Math.floor(waitOf(o)),
          isPriority:   o.isPriority,
        })),
      }
    }
  )
}
