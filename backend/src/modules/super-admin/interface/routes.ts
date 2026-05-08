import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { requireSuperAdmin } from '../../../shared/middleware/auth'

const createStoreSchema = z.object({
  storeName:     z.string().min(2),
  ownerName:     z.string().min(2),
  ownerEmail:    z.string().email(),
  ownerPassword: z.string().min(6),
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

  // ── Stores management ─────────────────────────────────────────────────────
  app.get('/super-admin/stores', { preHandler: requireSuperAdmin }, async () => {
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.created_at,
              sf.custom_theme_enabled,
              sf.whatsapp_enabled,
              COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED') AS delivered_count
       FROM stores s
       LEFT JOIN store_features sf ON sf.store_id = s.id
       LEFT JOIN orders o          ON o.store_id  = s.id
       GROUP BY s.id, s.name, s.created_at, sf.custom_theme_enabled, sf.whatsapp_enabled
       ORDER BY s.name ASC`
    )
    return rows.map((r: Record<string, unknown>) => ({
      id:                 r.id,
      name:               r.name,
      createdAt:          r.created_at,
      customThemeEnabled: r.custom_theme_enabled ?? false,
      whatsappEnabled:    r.whatsapp_enabled ?? false,
      deliveredCount:     Number(r.delivered_count ?? 0),
    }))
  })

  const featuresSchema = z.object({
    customThemeEnabled: z.boolean().optional(),
    whatsappEnabled:    z.boolean().optional(),
  })

  app.patch(
    '/super-admin/stores/:storeId/features',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string }
      const body = featuresSchema.parse(req.body)

      const { rows: [store] } = await db.query(
        'SELECT id FROM stores WHERE id = $1', [storeId]
      )
      if (!store) return reply.code(404).send({ error: 'Store not found' })

      await db.query(
        `INSERT INTO store_features (store_id, custom_theme_enabled, whatsapp_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id) DO UPDATE
         SET custom_theme_enabled = COALESCE($2, store_features.custom_theme_enabled),
             whatsapp_enabled     = COALESCE($3, store_features.whatsapp_enabled),
             updated_at           = now()`,
        [storeId, body.customThemeEnabled ?? null, body.whatsappEnabled ?? null]
      )

      const { rows: [features] } = await db.query(
        'SELECT custom_theme_enabled, whatsapp_enabled FROM store_features WHERE store_id = $1',
        [storeId]
      )

      return {
        storeId,
        customThemeEnabled: features.custom_theme_enabled as boolean,
        whatsappEnabled:    features.whatsapp_enabled as boolean,
      }
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
        `INSERT INTO stores (name) VALUES ($1) RETURNING id, name, created_at`,
        [body.storeName]
      )

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
}
