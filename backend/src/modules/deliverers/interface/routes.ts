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
      const { status, lat, lng } = z.object({
        status: z.enum(['AVAILABLE', 'ON_ROUTE', 'OFFLINE']),
        lat:    z.number().optional(),
        lng:    z.number().optional(),
      }).parse(req.body)

      // Block going OFFLINE while there are active orders
      if (status === 'OFFLINE') {
        const { rows } = await db.query(
          `SELECT COUNT(*) AS cnt FROM orders
           WHERE deliverer_id = $1
             AND status NOT IN ('DELIVERED','CANCELLED')`,
          [req.actor.sub]
        )
        if (Number(rows[0].cnt) > 0) {
          return reply.code(409).send({ error: 'Finalize as entregas em andamento antes de ficar OFFLINE.' })
        }
      }

      await repo.updateStatus(req.actor.sub, req.actor.storeId, status)

      await db.query(
        `INSERT INTO deliverer_status_history (deliverer_id, store_id, status, lat, lng)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.actor.sub, req.actor.storeId, status, lat ?? null, lng ?? null]
      )

      return reply.send({ ok: true })
    }
  )

  app.get(
    '/deliverer/me',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { rows: [d] } = await db.query(
        `SELECT id, name, username, store_id, status, profile_image_url, needs_onboarding
         FROM deliverers WHERE id = $1`,
        [req.actor.sub]
      )
      if (!d) return reply.code(404).send({ error: 'Not found' })
      return {
        id:              d.id as string,
        name:            d.name as string,
        username:        d.username as string,
        storeId:         d.store_id as string,
        status:          d.status as string,
        profileImageUrl: d.profile_image_url as string | null,
        needsOnboarding: d.needs_onboarding as boolean,
      }
    }
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

  // Store user fetches a single deliverer with their status history
  app.get(
    '/deliverers/:id/history',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { rows: [d] } = await db.query(
        `SELECT id, name, username, email, status, profile_image_url, is_active, created_at
         FROM deliverers WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!d) return reply.code(404).send({ error: 'Entregador não encontrado' })

      const { rows: history } = await db.query(
        `SELECT status, lat, lng, changed_at
         FROM deliverer_status_history
         WHERE deliverer_id = $1
         ORDER BY changed_at DESC
         LIMIT 100`,
        [id]
      )

      return {
        id:              d.id,
        name:            d.name,
        username:        d.username,
        email:           d.email,
        status:          d.status,
        profileImageUrl: d.profile_image_url,
        isActive:        d.is_active,
        createdAt:       d.created_at,
        history: history.map((h: Record<string, unknown>) => ({
          status:    h.status,
          lat:       h.lat,
          lng:       h.lng,
          changedAt: h.changed_at,
        })),
      }
    }
  )

  // Deliverer fetches own store info (for distance calculation + settings)
  app.get('/deliverer/store', { preHandler: requireDeliverer }, async (req) => {
    const { rows: [store] } = await db.query(
      'SELECT name, lat, lng FROM stores WHERE id = $1',
      [req.actor.storeId]
    )
    const { rows: [settings] } = await db.query(
      'SELECT require_pickup_code, require_delivery_code FROM store_settings WHERE store_id = $1',
      [req.actor.storeId]
    )
    return {
      name:               store?.name ?? '',
      lat:                store?.lat  ?? null,
      lng:                store?.lng  ?? null,
      requirePickupCode:  settings?.require_pickup_code  ?? true,
      requireDeliveryCode: settings?.require_delivery_code ?? true,
    }
  })
}
