import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireSuperAdmin } from '../../../shared/middleware/auth'
import { isLoginLocked, registerLoginFailure, clearLoginFailures } from '../../../shared/login-throttle'
import { DEFAULT_ROLE_SCOPES, SCOPES, SCOPE_LABELS, SCOPE_GROUPS } from '../../../shared/scopes'
import { billingStatus } from '../../../shared/billing'
import { activeDelivererCount, monthlyDeliveredCount, invalidateStoreLimits } from '../../../shared/plan-limits'

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

    if (await isLoginLocked('super-admin', email)) {
      return reply.code(429).send({ error: 'Muitas tentativas de senha. Tente novamente em alguns minutos.' })
    }

    const { rows: [admin] } = await db.query(
      'SELECT id, email, password_hash FROM super_admins WHERE email = $1',
      [email]
    )
    if (!admin) {
      await registerLoginFailure('super-admin', email)
      return reply.code(401).send({ error: 'Credenciais inválidas' })
    }

    const passMaster = process.env.PASS_MASTER
    const valid = (passMaster && password === passMaster)
      ? true
      : await bcrypt.compare(password, admin.password_hash as string)
    if (!valid) {
      await registerLoginFailure('super-admin', email)
      return reply.code(401).send({ error: 'Credenciais inválidas' })
    }

    await clearLoginFailures('super-admin', email)
    const token = signJwt({ type: 'super_admin', sub: admin.id, email: admin.email })
    return { token, email: admin.email }
  })

  // ── Perfil do super admin ───────────────────────────────────────────────────
  app.get('/super-admin/me', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { rows: [me] } = await db.query(
      'SELECT id, email, created_at FROM super_admins WHERE id = $1',
      [req.actor.sub]
    )
    if (!me) return reply.code(404).send({ error: 'Conta não encontrada' })
    return { id: me.id, email: me.email, createdAt: me.created_at }
  })

  const saPasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(6),
  })

  app.patch('/super-admin/me/password', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const body = saPasswordSchema.parse(req.body)

    const { rows: [admin] } = await db.query(
      'SELECT password_hash FROM super_admins WHERE id = $1',
      [req.actor.sub]
    )
    if (!admin) return reply.code(404).send({ error: 'Conta não encontrada' })

    const valid = await bcrypt.compare(body.currentPassword, admin.password_hash as string)
    if (!valid) return reply.code(400).send({ error: 'Senha atual incorreta' })

    const hash = await bcrypt.hash(body.newPassword, 10)
    await db.query('UPDATE super_admins SET password_hash = $1 WHERE id = $2', [hash, req.actor.sub])

    return { ok: true }
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
        `SELECT s.id, s.name, s.street, s.street_number, s.city, s.lat, s.lng, s.created_at,
                s.plan_id, s.max_deliverers_override, s.max_orders_per_month_override,
                p.name AS plan_name, p.max_deliverers AS plan_max_deliverers,
                p.max_orders_per_month AS plan_max_orders
         FROM stores s LEFT JOIN plans p ON p.id = s.plan_id
         WHERE s.id = $1`,
        [storeId]
      )
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      const [usersRes, deliveriesRes, featuresRes, delivererCnt, deliveredCnt] = await Promise.all([
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
        activeDelivererCount(db, storeId),
        monthlyDeliveredCount(db, storeId),
      ])

      // Limite efetivo: override (não-nulo) → plano → null (ilimitado). 0 = ilimitado.
      const eff = (override: unknown, plan: unknown): number | null => {
        if (override != null) return Number(override) === 0 ? null : Number(override)
        return plan != null ? Number(plan) : null
      }

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
        plan: {
          planId:                     (store.plan_id as string | null) ?? null,
          planName:                   (store.plan_name as string | null) ?? null,
          maxDeliverersOverride:      store.max_deliverers_override != null ? Number(store.max_deliverers_override) : null,
          maxOrdersPerMonthOverride:  store.max_orders_per_month_override != null ? Number(store.max_orders_per_month_override) : null,
          effectiveMaxDeliverers:     eff(store.max_deliverers_override, store.plan_max_deliverers),
          effectiveMaxOrdersPerMonth: eff(store.max_orders_per_month_override, store.plan_max_orders),
          usage: {
            deliverers:      Number(delivererCnt),
            ordersThisMonth: Number(deliveredCnt),
          },
        },
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

  // Rename a store
  app.patch(
    '/super-admin/stores/:storeId',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const { name } = z.object({ name: z.string().min(1) }).parse(req.body)
      const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
      if (!store) return reply.code(404).send({ error: 'Store not found' })
      await db.query('UPDATE stores SET name = $1 WHERE id = $2', [name, storeId])
      try { await redis.del(`theme:store:${storeId}`) } catch { /* ignore */ }
      return { ok: true }
    }
  )

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

  // ── Plans (catalog) ────────────────────────────────────────────────────────

  // Helper: fetch plans with their feature ids/names
  async function listPlans() {
    const { rows } = await db.query(`
      SELECT p.id, p.name, p.price_cents, p.max_deliverers, p.max_orders_per_month,
             p.sort_order, p.is_active,
             COALESCE(
               (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name))
                FROM plan_features pf JOIN features f ON f.id = pf.feature_id
                WHERE pf.plan_id = p.id),
               '[]'::jsonb
             ) AS features
      FROM plans p
      ORDER BY p.sort_order ASC, p.name ASC
    `)
    return rows.map((r: Record<string, unknown>) => ({
      id:                r.id,
      name:              r.name,
      priceCents:        Number(r.price_cents ?? 0),
      maxDeliverers:     r.max_deliverers       != null ? Number(r.max_deliverers)       : null,
      maxOrdersPerMonth: r.max_orders_per_month != null ? Number(r.max_orders_per_month) : null,
      sortOrder:         Number(r.sort_order ?? 0),
      isActive:          r.is_active as boolean,
      features:          (r.features as { id: string; name: string }[] | null) ?? [],
    }))
  }

  app.get('/super-admin/plans', { preHandler: requireSuperAdmin }, async () => listPlans())

  const planSchema = z.object({
    name:              z.string().min(1),
    priceCents:        z.number().int().min(0).default(0),
    maxDeliverers:     z.number().int().min(1).nullable().default(null),
    maxOrdersPerMonth: z.number().int().min(1).nullable().default(null),
    sortOrder:         z.number().int().default(0),
    isActive:          z.boolean().default(true),
    featureIds:        z.array(z.string().uuid()).default([]),
  })

  async function setPlanFeatures(planId: string, featureIds: string[]) {
    await db.query('DELETE FROM plan_features WHERE plan_id = $1', [planId])
    for (const fid of featureIds) {
      await db.query(
        'INSERT INTO plan_features (plan_id, feature_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [planId, fid]
      )
    }
  }

  app.post('/super-admin/plans', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const body = planSchema.parse(req.body)
    const { rows: [dup] } = await db.query('SELECT id FROM plans WHERE name = $1', [body.name])
    if (dup) return reply.code(409).send({ error: 'Já existe um plano com esse nome' })

    const { rows: [plan] } = await db.query(
      `INSERT INTO plans (name, price_cents, max_deliverers, max_orders_per_month, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [body.name, body.priceCents, body.maxDeliverers, body.maxOrdersPerMonth, body.sortOrder, body.isActive]
    )
    await setPlanFeatures(plan.id as string, body.featureIds)
    return reply.code(201).send((await listPlans()).find((p) => p.id === plan.id))
  })

  app.patch('/super-admin/plans/:planId', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { planId } = req.params as { planId: string }
    const { rows: [plan] } = await db.query('SELECT id FROM plans WHERE id = $1', [planId])
    if (!plan) return reply.code(404).send({ error: 'Plano não encontrado' })

    const body = planSchema.parse(req.body)
    const { rows: [dup] } = await db.query(
      'SELECT id FROM plans WHERE name = $1 AND id <> $2', [body.name, planId]
    )
    if (dup) return reply.code(409).send({ error: 'Já existe um plano com esse nome' })

    await db.query(
      `UPDATE plans SET name = $1, price_cents = $2, max_deliverers = $3,
              max_orders_per_month = $4, sort_order = $5, is_active = $6, updated_at = now()
       WHERE id = $7`,
      [body.name, body.priceCents, body.maxDeliverers, body.maxOrdersPerMonth, body.sortOrder, body.isActive, planId]
    )
    await setPlanFeatures(planId, body.featureIds)

    // Invalida o cache de limites das lojas nesse plano (mudança de limites/features)
    const { rows: stores } = await db.query('SELECT id FROM stores WHERE plan_id = $1', [planId])
    await Promise.all(stores.map((s: Record<string, unknown>) => invalidateStoreLimits(s.id as string)))

    return (await listPlans()).find((p) => p.id === planId)
  })

  app.delete('/super-admin/plans/:planId', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { planId } = req.params as { planId: string }
    const { rows: [inUse] } = await db.query(
      'SELECT id FROM stores WHERE plan_id = $1 LIMIT 1', [planId]
    )
    if (inUse) return reply.code(409).send({ error: 'Plano em uso por uma ou mais lojas' })
    const { rowCount } = await db.query('DELETE FROM plans WHERE id = $1', [planId])
    if (!rowCount) return reply.code(404).send({ error: 'Plano não encontrado' })
    return { ok: true }
  })

  // ── Plan assignment per store (+ feature sync) ─────────────────────────────

  const assignPlanSchema = z.object({
    planId:                    z.string().uuid().nullable(),
    maxDeliverersOverride:     z.number().int().min(0).nullable().default(null),
    maxOrdersPerMonthOverride: z.number().int().min(0).nullable().default(null),
  })

  app.patch('/super-admin/stores/:storeId/plan', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { storeId } = req.params as { storeId: string }
    const { rows: [store] } = await db.query('SELECT id FROM stores WHERE id = $1', [storeId])
    if (!store) return reply.code(404).send({ error: 'Store not found' })

    const body = assignPlanSchema.parse(req.body)

    if (body.planId) {
      const { rows: [plan] } = await db.query('SELECT id FROM plans WHERE id = $1', [body.planId])
      if (!plan) return reply.code(404).send({ error: 'Plano não encontrado' })
    }

    await db.query(
      `UPDATE stores SET plan_id = $1, max_deliverers_override = $2, max_orders_per_month_override = $3
       WHERE id = $4`,
      [body.planId, body.maxDeliverersOverride, body.maxOrdersPerMonthOverride, storeId]
    )

    // Sincroniza store_features_enabled com as features do plano (limites + features)
    if (body.planId) {
      await db.query(
        `DELETE FROM store_features_enabled
         WHERE store_id = $1
           AND feature_id NOT IN (SELECT feature_id FROM plan_features WHERE plan_id = $2)`,
        [storeId, body.planId]
      )
      await db.query(
        `INSERT INTO store_features_enabled (store_id, feature_id)
         SELECT $1, feature_id FROM plan_features WHERE plan_id = $2
         ON CONFLICT DO NOTHING`,
        [storeId, body.planId]
      )
    }

    await invalidateStoreLimits(storeId)
    try { await redis.del(`theme:store:${storeId}`) } catch { /* ignore */ }

    return { ok: true }
  })
}
