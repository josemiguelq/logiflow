import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { createPgCustomerRepo } from '../infrastructure/repositories/pg-customer-repo'

const addressSchema = z.object({
  id:         z.string().uuid().optional(),
  label:      z.string().min(1).default('Principal'),
  address:    z.string().min(1),
  number:     z.string().optional(),
  complement: z.string().optional(),
  lat:        z.number().optional(),
  lng:        z.number().optional(),
  isDefault:  z.boolean().optional(),
})

const customerCreateSchema = z.object({
  name:      z.string().min(1),
  phone:     z.string().min(8),
  addresses: z.array(addressSchema).min(1),
})

const customerUpdateSchema = z.object({
  name:      z.string().min(1).optional(),
  phone:     z.string().min(8).optional(),
  addresses: z.array(addressSchema).min(1).optional(),
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
      const body = customerCreateSchema.parse(req.body)
      const existing = await repo.findByPhone(req.actor.storeId, body.phone)
      if (existing) return existing

      const customer = await repo.create(
        { storeId: req.actor.storeId, name: body.name, phone: body.phone },
        body.addresses.map((a, i) => ({ ...a, isDefault: i === 0 || !!a.isDefault }))
      )
      return reply.code(201).send(customer)
    }
  )

  app.put(
    '/customers/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body   = customerUpdateSchema.parse(req.body)

      const existing = await repo.findById(id, req.actor.storeId)
      if (!existing) return reply.code(404).send({ error: 'Not found' })

      await repo.update(id, req.actor.storeId, { name: body.name, phone: body.phone })

      // Sync address sub-table when addresses are provided
      if (body.addresses) {
        const currentIds  = new Set(existing.addresses.map(a => a.id))
        const incomingIds = new Set(
          body.addresses.filter(a => a.id).map(a => a.id!)
        )

        // Delete addresses that were removed
        for (const addrId of currentIds) {
          if (!incomingIds.has(addrId)) {
            await repo.removeAddress(addrId, id, req.actor.storeId)
          }
        }

        // Insert new / update existing
        for (let i = 0; i < body.addresses.length; i++) {
          const addr = body.addresses[i]!
          const isDefault = i === 0 || !!addr.isDefault
          if (addr.id) {
            await repo.updateAddress(addr.id, id, req.actor.storeId, { ...addr, isDefault })
          } else {
            await repo.addAddress(id, req.actor.storeId, { ...addr, isDefault })
          }
        }
      }

      return repo.findById(id, req.actor.storeId)
    }
  )

  // ── Address sub-routes ──────────────────────────────────────────────────────

  app.post(
    '/customers/:id/addresses',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = addressSchema.parse(req.body)
      const addr = await repo.addAddress(id, req.actor.storeId, body)
      return reply.code(201).send(addr)
    }
  )

  app.patch(
    '/customers/:id/addresses/:addressId',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id, addressId } = req.params as { id: string; addressId: string }
      const body = addressSchema.partial().parse(req.body)
      const addr = await repo.updateAddress(addressId, id, req.actor.storeId, body)
      if (!addr) return reply.code(404).send({ error: 'Not found' })
      return addr
    }
  )

  app.delete(
    '/customers/:id/addresses/:addressId',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id, addressId } = req.params as { id: string; addressId: string }
      const ok = await repo.removeAddress(addressId, id, req.actor.storeId)
      if (!ok) return reply.code(404).send({ error: 'Not found' })
      return reply.send({ ok: true })
    }
  )
}
