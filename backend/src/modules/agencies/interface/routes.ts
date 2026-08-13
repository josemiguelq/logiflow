import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgAgencyRepo } from '../infrastructure/repositories/pg-agency-repo'

const createSchema = z.object({
  name:    z.string().min(1).transform(s => s.trim()),
  address: z.string().min(1).transform(s => s.trim()),
  lat:     z.number().nullable().optional(),
  lng:     z.number().nullable().optional(),
})

const updateSchema = z.object({
  name:    z.string().min(1).transform(s => s.trim()).optional(),
  address: z.string().min(1).transform(s => s.trim()).optional(),
  lat:     z.number().nullable().optional(),
  lng:     z.number().nullable().optional(),
})

export async function agencyRoutes(app: FastifyInstance) {
  const repo = createPgAgencyRepo(db)

  // Auditoria best-effort (não reverte a operação em caso de falha).
  const audit = (
    req: FastifyRequest, id: string,
    action: 'CREATED' | 'UPDATED', before: unknown, after: unknown,
  ) =>
    db.query(
      `INSERT INTO agency_audit
         (store_id, agency_id, action, before, after, changed_by, changed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.actor.storeId, id, action,
       before ? JSON.stringify(before) : null,
       after ? JSON.stringify(after) : null,
       req.actor.sub, req.actor.name],
    ).catch((err) => req.log.error({ err }, 'agency audit failed'))

  // Busca por nome para o dropdown. Reusa o scope de clientes.
  app.get(
    '/agencies',
    { preHandler: [requireStoreUser, requireScope('customers:view')] },
    async (req) => {
      const { search } = req.query as { search?: string }
      const items = await repo.findByStore(req.actor.storeId, search?.trim() || undefined)
      return { items }
    },
  )

  app.post(
    '/agencies',
    { preHandler: [requireStoreUser, requireScope('customers:create')] },
    async (req, reply) => {
      const body = createSchema.parse(req.body)

      // Idempotente: mesmo nome na loja retorna a existente.
      const existing = await repo.findByName(req.actor.storeId, body.name)
      if (existing) return existing

      const created = await repo.create({
        storeId:       req.actor.storeId,
        name:          body.name,
        address:       body.address,
        lat:           body.lat ?? null,
        lng:           body.lng ?? null,
        createdBy:     req.actor.sub,
        createdByName: req.actor.name,
      })
      await audit(req, created.id, 'CREATED', null, { name: created.name, address: created.address })
      return reply.code(201).send(created)
    },
  )

  app.put(
    '/agencies/:id',
    { preHandler: [requireStoreUser, requireScope('customers:create')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body   = updateSchema.parse(req.body)

      const before = await repo.findById(id, req.actor.storeId)
      if (!before) return reply.code(404).send({ error: 'Agência não encontrada' })

      const updated = await repo.update(id, req.actor.storeId, body)
      if (!updated) return reply.code(404).send({ error: 'Agência não encontrada' })
      await audit(req, id, 'UPDATED',
        { name: before.name, address: before.address },
        { name: updated.name, address: updated.address })
      return updated
    },
  )
}
