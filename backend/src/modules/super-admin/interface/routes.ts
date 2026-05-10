import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireSuperAdmin } from '../../../shared/middleware/auth'
import { DEFAULT_ROLE_SCOPES, SCOPES, SCOPE_LABELS, SCOPE_GROUPS } from '../../../shared/scopes'
import { billingStatus } from '../../../shared/billing'

const createStoreSchema = z.object({
  storeName:     z.string().min(2),
  ownerName:     z.string().min(2),
  ownerEmail:    z.string().email(),
  ownerPassword: z.string().min(6),
  street:        z.string().optional(),
  streetNumber:  z.string().optional(),
  city:          z.string().optional(),
  lat:           z.number().optional(),
  lng:           z.number().optional(),
})

export async function superAdminRoutes(app: FastifyInstance) {
  const signJwt = (payload: object) => app.jwt.sign(payload as Record<string, unknown>)

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post('/super-admin/login', async (req, reply) => {
    const { email, password } = z.object({
      email:    z.string().email(),
      password: z.string().min(1),
    }).parse(req.body)

    const { rows: [admin] } = await db.query(
      'SELECT id, email, password_hash FROM super_admins WHERE email = $1',
      [email]
    )
    if (!admin) return reply.code(401).send({ error: 'Credenciais inválidas' })

    const valid = await bcrypt.compare(password, admin.password_hash as string)
    if (!valid) return reply.code(401).send({ error: 'Credenciais inválidas' })

    const token = signJwt({ type: 'super_admin', sub: admin.id, email: admin.email })
    return { token, email: admin.email }
  })

  // ── Analytics ─────────────────────────────────────────────────────────────

  app.get('/super-admin/analytics', { preHandler: requireSuperAdmin }, async () => {
    const { rows } = await db.query(`
      SELECT
        s.id,
        s.name,
        s.lat,
        s.lng,
        s.city,
        COUNT(o.id)                                                    AS total_orders,
        COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED')             AS delivered,
        COUNT(o.id) FILTER (WHERE o.status = 'CANCELLED')             AS cancelled,
        COUNT(o.id) FILTER (WHERE o.status NOT IN ('DELIVERED','CANCELLED')) AS in_progress
      FROM stores s
      LEFT JOIN orders o ON o.store_id = s.id
      GROUP BY s.id, s.name, s.lat, s.lng, s.city
      ORDER BY delivered DESC, s.name ASC
    `)
    return rows.map((r: Record<string, unknown>) => ({
      id:         r.id,
      name:       r.name,
      lat:        r.lat  != null ? Number(r.lat)  : null,
      lng:        r.lng  != null ? Number(r.lng)  : null,
      city:       r.city ?? null,
      total:      Number(r.total_orders),
      delivered:  Number(r.delivered),
      cancelled:  Number(r.cancelled),
      inProgress: Number(r.in_progress),
    }))
  })

  // ── Features catalog ──────────────────────────────────────────────────────

  app.get('/super-admin/features', { preHandler: requireSuperAdmin }, async () => {
    const { rows } = await db.query(
      'SELECT id, name, description FROM features ORDER BY name'
    )
    return rows.map((r: Record<string, unknown>) => ({
      id:          r.id,
      name:        r.name,
      description: r.description,
    }))
  })

  // ── Store detail ──────────────────────────────────────────────────────────

  app.get(
    '/super-admin/stores/:storeId',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }

      const { rows: [store] } = await db.query(
        'SELECT id, name, street, street_number, city, lat, lng, created_at FROM stores WHERE id = $1',
        [storeId]
      )
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const [usersRes, deliveriesRes, featuresRes] = await Promise.all([
        db.query(
          'SELECT COUNT(*) AS cnt FROM store_users WHERE store_id = $1',
          [storeId]
        ),
        db.query(
          `SELECT COUNT(*) AS cnt FROM orders
           WHERE store_id = $1 AND status = 'DELIVERED'
             AND delivered_at >= now() - INTERVAL '30 days'`,
          [storeId]
        ),
        db.query(
          `SELECT f.id, f.name, f.description
           FROM store_features_enabled sfe
           JOIN features f ON f.id = sfe.feature_id
           WHERE sfe.store_id = $1
           ORDER BY f.name`,
          [storeId]
        ),
      ])

      return {
        id:                   store.id,
        name:                 store.name,
        createdAt:            store.created_at,
        street:               store.street        ?? null,
        streetNumber:         store.street_number ?? null,
        city:                 store.city          ?? null,
        lat:                  store.lat           ?? null,
        lng:                  store.lng           ?? null,
        userCount:            Number(usersRes.rows[0]?.cnt ?? 0),
        deliveriesLastMonth:  Number(deliveriesRes.rows[0]?.cnt ?? 0),
        enabledFeatures:      featuresRes.rows.map((r: Record<string, unknown>) => ({
          id:          r.id,
          name:        r.name,
          description: r.description,
        })),
      }
    }
  )

  // ── Stores management ─────────────────────────────────────────────────────
  app.get('/super-admin/stores', { preHandler: requireSuperAdmin }, async () => {
    const { rows } = await db.query(`
      SELECT s.id, s.name, s.created_at,
             COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED') AS delivered_count,
             COALESCE(
               (SELECT jsonb_agg(f.name)
                FROM store_features_enabled sfe
                JOIN features f ON f.id = sfe.feature_id
                WHERE sfe.store_id = s.id),
               '[]'::jsonb
             ) AS enabled_features
      FROM stores s
      LEFT JOIN orders o ON o.store_id = s.id
      GROUP BY s.id, s.name, s.created_at
      ORDER BY s.name ASC
    `)
    return rows.map((r: Record<string, unknown>) => ({
      id:              r.id,
      name:            r.name,
      createdAt:       r.created_at,
      deliveredCount:  Number(r.delivered_count ?? 0),
      enabledFeatures: (r.enabled_features as string[] | null) ?? [],
    }))
  })

  // Enable a feature for a store
  app.post(
    '/super-admin/stores/:storeId/features-enabled',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { featureId } = z.object({ featureId: z.string().uuid() }).parse(req.body)

      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const { rows: [feature] } = await db.query('SELECT id, name FROM features WHERE id = $1', [featureId])
      if (!feature) return reply.code(404).send({ error: 'Feature not found' })

      await db.query(
        `INSERT INTO store_features_enabled (store_id, feature_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [storeId, featureId]
      )

      try { await redis.del(`theme:store:${storeId}`) } catch { /* ignore */ }

      return { storeId, featureId, featureName: feature.name }
    }
  )

  // Disable a feature for a store
  app.delete(
    '/super-admin/stores/:storeId/features-enabled/:featureId',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId, featureId } = req.params as { storeId: string; featureId: string }

      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      await db.query(
        'DELETE FROM store_features_enabled WHERE store_id = $1 AND feature_id = $2',
        [storeId, featureId]
      )

      try { await redis.del(`theme:store:${storeId}`) } catch { /* ignore */ }

      return { ok: true }
    }
  )

  app.post(
    '/super-admin/stores',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const body = createStoreSchema.parse(req.body)

      const { rows: [existing] } = await db.query(
        'SELECT id FROM store_users WHERE email = $1', [body.ownerEmail]
      )
      if (existing) return reply.code(409).send({ error: 'Email já está em uso' })

      const { rows: [store] } = await db.query(
        `INSERT INTO stores (name, street, street_number, city, lat, lng, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, (now() + INTERVAL '6 months')::DATE)
         RETURNING id, name, created_at, trial_ends_at`,
        [
          body.storeName,
          body.street       ?? null,
          body.streetNumber ?? null,
          body.city         ?? null,
          body.lat          ?? null,
          body.lng          ?? null,
        ]
      )

      // Seed default role scopes for the new store
      for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
        await db.query(
          `INSERT INTO store_role_scopes (store_id, role, scopes)
           VALUES ($1, $2, $3)
           ON CONFLICT (store_id, role) DO NOTHING`,
          [store.id, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])]
        )
      }

      const hash = await bcrypt.hash(body.ownerPassword, 10)
      const username = body.ownerEmail.split('@')[0]!.toLowerCase().replace(/[^a-z0-9_.]/g, '_')
      const { rows: [user] } = await db.query(
        `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
         VALUES ($1,$2,$3,$4,$5,'OWNER') RETURNING id, name, email`,
        [store.id, body.ownerName, body.ownerEmail, username, hash]
      )

      return reply.code(201).send({
        store: { id: store.id, name: store.name, createdAt: store.created_at },
        owner: { id: user.id, name: user.name, email: user.email },
      })
    }
  )

  // ── Store user management ─────────────────────────────────────────────────

  app.get(
    '/super-admin/stores/:storeId/users',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const { rows } = await db.query(
        `SELECT id, name, email, username, role, created_at
         FROM store_users WHERE store_id = $1 ORDER BY created_at ASC`,
        [storeId]
      )
      return rows.map((r: Record<string, unknown>) => ({
        id:        r.id,
        name:      r.name,
        email:     r.email,
        username:  r.username,
        role:      r.role,
        createdAt: r.created_at,
      }))
    }
  )

  const createStoreUserSchema = z.object({
    name:     z.string().min(2),
    email:    z.string().email(),
    username: z.string().min(3).regex(/^[a-z0-9_.]+$/),
    password: z.string().min(6),
    role:     z.enum(['OWNER', 'MANAGER', 'ASSISTANT']),
  })

  app.post(
    '/super-admin/stores/:storeId/users',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const body = createStoreUserSchema.parse(req.body)

      const { rows: [dup] } = await db.query(
        'SELECT id FROM store_users WHERE email = $1 OR username = $2',
        [body.email, body.username]
      )
      if (dup) return reply.code(409).send({ error: 'Email ou username já em uso' })

      const hash = await bcrypt.hash(body.password, 10)
      const { rows: [user] } = await db.query(
        `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, username, role, created_at`,
        [storeId, body.name, body.email, body.username, hash, body.role]
      )
      return reply.code(201).send({
        id:        user.id,
        name:      user.name,
        email:     user.email,
        username:  user.username,
        role:      user.role,
        createdAt: user.created_at,
      })
    }
  )

  app.delete(
    '/super-admin/stores/:storeId/users/:userId',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId, userId } = req.params as { storeId: string; userId: string }
      const { rows: [user] } = await db.query(
        'SELECT id, role FROM store_users WHERE id = $1 AND store_id = $2',
        [userId, storeId]
      )
      if (!user) return reply.code(404).send({ error: 'Usuário não encontrado' })

      await db.query('DELETE FROM store_users WHERE id = $1', [userId])
      return { ok: true }
    }
  )

  // ── Scope definitions (read-only — consumed by the SA UI) ─────────────────

  // ── Billing management ────────────────────────────────────────────────────

  const billingSchema = z.object({
    trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    billingDay:  z.number().int().min(1).max(28).optional(),
  })

  app.get(
    '/super-admin/stores/:storeId/billing',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }

      const { rows: [store] } = await db.query(
        'SELECT trial_ends_at, billing_day FROM stores WHERE id = $1',
        [storeId]
      )
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const { rows: payments } = await db.query(
        `SELECT id, reference_month, paid_at, notes
         FROM store_payments WHERE store_id = $1
         ORDER BY reference_month DESC`,
        [storeId]
      )

      const paidMonths = payments.map((p: Record<string, unknown>) =>
        (p.reference_month as Date).toISOString().slice(0, 10)
      )

      const status = billingStatus(
        { trial_ends_at: store.trial_ends_at as Date | null, billing_day: store.billing_day as number | null },
        paidMonths
      )

      return {
        ...status,
        payments: payments.map((p: Record<string, unknown>) => ({
          id:             p.id,
          referenceMonth: (p.reference_month as Date).toISOString().slice(0, 10),
          paidAt:         p.paid_at,
          notes:          p.notes ?? null,
        })),
      }
    }
  )

  app.patch(
    '/super-admin/stores/:storeId/billing',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const body = billingSchema.parse(req.body)
      const sets: string[]    = []
      const params: unknown[] = [storeId]
      let idx = 2

      if (body.trialEndsAt !== undefined) { sets.push(`trial_ends_at = $${idx++}`); params.push(body.trialEndsAt) }
      if (body.billingDay  !== undefined) { sets.push(`billing_day = $${idx++}`);   params.push(body.billingDay)  }

      if (sets.length > 0) {
        await db.query(`UPDATE stores SET ${sets.join(', ')} WHERE id = $1`, params)
      }

      return { ok: true }
    }
  )

  const paymentSchema = z.object({
    referenceMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), // "YYYY-MM"
    notes:          z.string().max(500).optional(),
  })

  app.post(
    '/super-admin/stores/:storeId/payments',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const body = paymentSchema.parse(req.body)
      const referenceMonth = `${body.referenceMonth}-01` // "YYYY-MM-01"

      const { rows: [payment] } = await db.query(
        `INSERT INTO store_payments (store_id, reference_month, notes)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, reference_month) DO UPDATE SET notes = EXCLUDED.notes, paid_at = now()
         RETURNING id, reference_month, paid_at, notes`,
        [storeId, referenceMonth, body.notes ?? null]
      )

      return reply.code(201).send({
        id:             payment.id,
        referenceMonth: (payment.reference_month as Date).toISOString().slice(0, 10),
        paidAt:         payment.paid_at,
        notes:          payment.notes ?? null,
      })
    }
  )

  app.delete(
    '/super-admin/stores/:storeId/payments/:paymentId',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId, paymentId } = req.params as { storeId: string; paymentId: string }
      const { rowCount } = await db.query(
        'DELETE FROM store_payments WHERE id = $1 AND store_id = $2',
        [paymentId, storeId]
      )
      if (!rowCount) return reply.code(404).send({ error: 'Payment not found' })
      return { ok: true }
    }
  )

  // ── Scope definitions (read-only — consumed by the SA UI) ─────────────────

  app.get('/super-admin/scopes', { preHandler: requireSuperAdmin }, async () => ({
    scopes:   SCOPES,
    labels:   SCOPE_LABELS,
    groups:   SCOPE_GROUPS,
    defaults: DEFAULT_ROLE_SCOPES,
  }))

  // ── Role scopes per store ─────────────────────────────────────────────────

  app.get(
    '/super-admin/stores/:storeId/role-scopes',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const { rows } = await db.query(
        'SELECT role, scopes FROM store_role_scopes WHERE store_id = $1',
        [storeId]
      )

      const result: Record<string, string[]> = {}
      for (const role of ['OWNER', 'MANAGER', 'ASSISTANT']) {
        const row = rows.find((r: Record<string, unknown>) => r.role === role)
        result[role] = (row?.scopes as string[] | undefined) ?? DEFAULT_ROLE_SCOPES[role] ?? []
      }
      return result
    }
  )

  const updateScopesSchema = z.object({
    scopes: z.array(z.string()),
  })

  app.put(
    '/super-admin/stores/:storeId/role-scopes/:role',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId, role } = req.params as { storeId: string; role: string }
      if (!['OWNER', 'MANAGER', 'ASSISTANT'].includes(role)) {
        return reply.code(400).send({ error: 'Invalid role' })
      }

      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const { scopes } = updateScopesSchema.parse(req.body)

      await db.query(
        `INSERT INTO store_role_scopes (store_id, role, scopes, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (store_id, role) DO UPDATE
         SET scopes = $3, updated_at = now()`,
        [storeId, role, JSON.stringify(scopes)]
      )

      return { storeId, role, scopes }
    }
  )
}
