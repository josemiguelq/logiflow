import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { requireSuperAdmin } from '../../../shared/middleware/auth'

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
              sf.whatsapp_enabled
       FROM stores s
       LEFT JOIN store_features sf ON sf.store_id = s.id
       ORDER BY s.name ASC`
    )
    return rows.map((r: Record<string, unknown>) => ({
      id:                 r.id,
      name:               r.name,
      createdAt:          r.created_at,
      customThemeEnabled: r.custom_theme_enabled ?? false,
      whatsappEnabled:    r.whatsapp_enabled ?? false,
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
}
