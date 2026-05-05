import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { createPgCustomerRepo } from '../infrastructure/repositories/pg-customer-repo'

const customerSchema = z.object({
  name:       z.string().min(1),
  phone:      z.string().min(8),
  address:    z.string().min(1),
  complement: z.string().optional(),
  lat:        z.number().optional(),
  lng:        z.number().optional(),
})

export async function customerRoutes(app: FastifyInstance) {
  const repo = createPgCustomerRepo(db)

  app.get(
    '/customers',
    { preHandler: requireStoreUser },
    async (req) => {
      const { search } = req.query as { search?: string }
      return repo.findByStore(req.actor.storeId, search)
    }
  )

  app.get(
    '/customers/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const customer = await repo.findById(id, req.actor.storeId)
      if (!customer) return reply.code(404).send({ error: 'Not found' })
      return customer
    }
  )

  app.post(
    '/customers',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const body = customerSchema.parse(req.body)
      const existing = await repo.findByPhone(req.actor.storeId, body.phone)
      if (existing) return existing
      const customer = await repo.create({ storeId: req.actor.storeId, ...body })
      return reply.code(201).send(customer)
    }
  )

  app.put(
    '/customers/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = customerSchema.partial().parse(req.body)
      const customer = await repo.update(id, req.actor.storeId, body)
      if (!customer) return reply.code(404).send({ error: 'Not found' })
      return customer
    }
  )
}
