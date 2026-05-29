import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireRole, requireScope } from '../../../shared/middleware/rbac'
import { createPgDelivererRepo } from '../infrastructure/repositories/pg-deliverer-repo'
import { createPgDeviceTokenRepo } from '../../notifications/infrastructure/repositories/pg-device-token-repo'

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

  // Store admin forces a deliverer offline (bypasses active-orders guard)
  app.patch(
    '/deliverers/:id/force-offline',
    { preHandler: [requireStoreUser, requireScope('deliverers:force_offline')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { rows: [d] } = await db.query(
        `SELECT id, status FROM deliverers WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!d) return reply.code(404).send({ error: 'Entregador não encontrado' })
      if ((d as Record<string, unknown>).status === 'OFFLINE') {
        return reply.send({ ok: true })
      }
      await repo.updateStatus(id, req.actor.storeId, 'OFFLINE')
      await db.query(
        `INSERT INTO deliverer_status_history (deliverer_id, store_id, status, lat, lng)
         VALUES ($1, $2, 'OFFLINE', NULL, NULL)`,
        [id, req.actor.storeId]
      )
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

  // Deliverer updates own profile (name, photo, password) and clears onboarding flag
  const profileSchema = z.object({
    name:            z.string().min(1).optional(),
    profileImageUrl: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword:     z.string().min(6).optional(),
  })

  app.patch('/deliverer/profile', { preHandler: requireDeliverer }, async (req, reply) => {
    const body = profileSchema.parse(req.body)
    const sets: string[]    = ['needs_onboarding = false']
    const params: unknown[] = []
    let idx = 1

    if (body.name) {
      sets.push(`name = $${idx++}`)
      params.push(body.name)
    }
    if (body.profileImageUrl) {
      sets.push(`profile_image_url = $${idx++}`)
      params.push(body.profileImageUrl)
    }
    if (body.newPassword) {
      if (body.currentPassword) {
        const { rows: [d] } = await db.query(
          'SELECT password_hash FROM deliverers WHERE id = $1', [req.actor.sub]
        )
        const valid = await bcrypt.compare(body.currentPassword, (d as Record<string, unknown>)?.password_hash as string ?? '')
        if (!valid) return reply.code(400).send({ error: 'Senha atual incorreta' })
      }
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

      const { rows: [ratingRow] } = await db.query(
        `SELECT
           ROUND(AVG(rating)::numeric, 1) AS avg_rating,
           COUNT(*) FILTER (WHERE rating IS NOT NULL) AS rating_count
         FROM orders
         WHERE deliverer_id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
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
        avgRating:       ratingRow?.avg_rating != null ? Number(ratingRow.avg_rating) : null,
        ratingCount:     Number(ratingRow?.rating_count ?? 0),
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
    const [{ rows: [store] }, { rows: settingRows }, { rows: themeRows }] = await Promise.all([
      db.query('SELECT name, lat, lng FROM stores WHERE id = $1', [req.actor.storeId]),
      db.query(
        `SELECT s.name, COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1`,
        [req.actor.storeId]
      ),
      db.query(
        `SELECT st.primary_color FROM store_features_enabled sfe
         JOIN features f ON f.id = sfe.feature_id
         LEFT JOIN store_theme st ON st.store_id = sfe.store_id
         WHERE sfe.store_id = $1 AND f.name = 'custom_theme'`,
        [req.actor.storeId]
      ),
    ])
    const sv = Object.fromEntries(
      settingRows.map((r: Record<string, unknown>) => [r.name as string, r.value as string])
    )
    const customThemeEnabled = themeRows.length > 0
    const primaryColor = customThemeEnabled
      ? ((themeRows[0] as Record<string, unknown> | undefined)?.primary_color as string | null ?? null)
      : null
    const storeRow = store as Record<string, unknown> | undefined
    return {
      name:                 storeRow?.name ?? '',
      storeName:            customThemeEnabled ? (storeRow?.name as string ?? null) : null,
      primaryColor,
      lat:                  storeRow?.lat  ?? null,
      lng:                  storeRow?.lng  ?? null,
      requirePickupCode:    sv.require_pickup_code    !== 'false',
      requireDeliveryCode:  sv.require_delivery_code  !== 'false',
      requireDeliveryPhoto: sv.require_delivery_photo === 'true',
<<<<<<< Updated upstream
=======
      maxProofPhotos:       parseInt(sv.max_proof_photos ?? '2', 10) || 1,
>>>>>>> Stashed changes
    }
  })

  // ── Push token registration ───────────────────────────────────────────────

  const tokenSchema = z.object({
    token:    z.string().min(1),
    platform: z.enum(['android', 'ios']),
  })

  const deviceTokenRepo = createPgDeviceTokenRepo(db)

  app.post(
    '/deliverer/push-token',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { token, platform } = tokenSchema.parse(req.body)
      await deviceTokenRepo.upsert(req.actor.sub, token, platform)
      return reply.code(204).send()
    }
  )

  app.delete(
    '/deliverer/push-token',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { token } = z.object({ token: z.string().min(1) }).parse(req.body)
      await deviceTokenRepo.delete(token)
      return reply.code(204).send()
    }
  )
}
