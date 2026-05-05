import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireRole } from '../../../shared/middleware/rbac'
import { createPgDelivererRepo } from '../infrastructure/repositories/pg-deliverer-repo'

const createSchema = z.object({
  name:     z.string().min(1),
  email:    z.string().email().optional(),
  username: z.string().min(3).regex(/^[a-z0-9_.]+$/),
  password: z.string().min(6),
})

const updateSchema = z.object({
  name:     z.string().min(1).optional(),
  email:    z.string().email().nullable().optional(),
  username: z.string().min(3).regex(/^[a-z0-9_.]+$/).optional(),
  password: z.string().min(6).optional(),
})

export async function delivererRoutes(app: FastifyInstance) {
  const repo = createPgDelivererRepo(db)

  app.get(
    '/deliverers',
    { preHandler: requireStoreUser },
    async (req) => repo.findByStore(req.actor.storeId)
  )

  app.get(
    '/deliverers/suggest',
    { preHandler: requireStoreUser },
    async (req) => repo.suggestForOrder(req.actor.storeId)
  )

  app.post(
    '/deliverers',
    { preHandler: [requireStoreUser, requireRole('MANAGER')] },
    async (req, reply) => {
      const body = createSchema.parse(req.body)
      const deliverer = await repo.create({ storeId: req.actor.storeId, ...body })
      return reply.code(201).send(deliverer)
    }
  )

  app.patch(
    '/deliverers/:id',
    { preHandler: [requireStoreUser, requireRole('MANAGER')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = updateSchema.parse(req.body)
      const deliverer = await repo.update(id, req.actor.storeId, body)
      if (!deliverer) return reply.code(404).send({ error: 'Entregador não encontrado' })
      return deliverer
    }
  )

  app.patch(
    '/deliverers/:id/active',
    { preHandler: [requireStoreUser, requireRole('MANAGER')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { active } = z.object({ active: z.boolean() }).parse(req.body)
      await repo.setActive(id, req.actor.storeId, active)
      return reply.send({ ok: true })
    }
  )

  // Deliverer updates own status
  app.patch(
    '/deliverer/status',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { status } = z.object({
        status: z.enum(['AVAILABLE', 'ON_ROUTE', 'OFFLINE']),
      }).parse(req.body)
      await repo.updateStatus(req.actor.sub, req.actor.storeId, status)
      return reply.send({ ok: true })
    }
  )

  app.get(
    '/deliverer/me',
    { preHandler: requireDeliverer },
    async (req) => ({
      id:      req.actor.sub,
      name:    req.actor.name,
      storeId: req.actor.storeId,
    })
  )

  // Deliverer updates own profile (photo + password) and clears onboarding flag
  const profileSchema = z.object({
    profileImageUrl: z.string().optional(),
    newPassword:     z.string().min(6).optional(),
  })

  app.patch('/deliverer/profile', { preHandler: requireDeliverer }, async (req, reply) => {
    const body = profileSchema.parse(req.body)
    const sets: string[]    = ['needs_onboarding = false']
    const params: unknown[] = []
    let idx = 1

    if (body.profileImageUrl) {
      sets.push(`profile_image_url = $${idx++}`)
      params.push(body.profileImageUrl)
    }
    if (body.newPassword) {
      const hash = await bcrypt.hash(body.newPassword, 10)
      sets.push(`password_hash = $${idx++}`)
      params.push(hash)
    }
    params.push(req.actor.sub)

    await db.query(
      `UPDATE deliverers SET ${sets.join(', ')} WHERE id = $${idx}`,
      params
    )
    return reply.send({ ok: true })
  })

  // Deliverer fetches own store info (for distance calculation)
  app.get('/deliverer/store', { preHandler: requireDeliverer }, async (req) => {
    const { rows: [store] } = await db.query(
      'SELECT name, lat, lng FROM stores WHERE id = $1',
      [req.actor.storeId]
    )
    return { name: store?.name ?? '', lat: store?.lat ?? null, lng: store?.lng ?? null }
  })
}
