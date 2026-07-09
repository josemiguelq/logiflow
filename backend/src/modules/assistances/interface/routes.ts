import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgAssistanceRepo } from '../infrastructure/repositories/pg-assistance-repo'

const createSchema = z.object({ name: z.string().min(1).transform(s => s.trim()) })

export async function assistanceRoutes(app: FastifyInstance) {
  const repo = createPgAssistanceRepo(db)

  // Registra a criação de uma assistência (quem/quando/o quê). Best-effort:
  // falha só loga, não reverte a operação — igual ao auditAddress de customers.
  const auditCreated = (req: FastifyRequest, id: string, name: string) =>
    db.query(
      `INSERT INTO assistance_audit
         (store_id, assistance_id, action, before, after, changed_by, changed_by_name)
       VALUES ($1,$2,'CREATED',NULL,$3,$4,$5)`,
      [req.actor.storeId, id, JSON.stringify({ name }), req.actor.sub, req.actor.name],
    ).catch((err) => req.log.error({ err }, 'assistance audit failed'))

  // Busca por nome para o dropdown (search-as-you-type). Reusa o scope de
  // clientes — gerenciar assistência é parte do gerenciamento de clientes.
  app.get(
    '/assistances',
    { preHandler: [requireStoreUser, requireScope('customers:view')] },
    async (req) => {
      const { search } = req.query as { search?: string }
      const items = await repo.findByStore(req.actor.storeId, search?.trim() || undefined)
      return { items }
    },
  )

  app.post(
    '/assistances',
    { preHandler: [requireStoreUser, requireScope('customers:create')] },
    async (req, reply) => {
      const { name } = createSchema.parse(req.body)

      // Idempotente: se já existe uma com o mesmo nome na loja, retorna a existente.
      const existing = await repo.findByName(req.actor.storeId, name)
      if (existing) return existing

      const created = await repo.create({
        storeId:       req.actor.storeId,
        name,
        createdBy:     req.actor.sub,
        createdByName: req.actor.name,
      })
      await auditCreated(req, created.id, created.name)
      return reply.code(201).send(created)
    },
  )
}
