import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'

const DEFAULT_THEME = {
  primary:   '#2563EB',
  secondary: '#F9FAFB',
  accent:    '#F97316',
  logoUrl:   null,
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /store/theme — retorna o tema da loja (autenticado)
  app.get('/store/theme', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    const { rows: [features] } = await db.query(
      'SELECT custom_theme_enabled FROM store_features WHERE store_id = $1',
      [storeId]
    )

    if (!features?.custom_theme_enabled) {
      return { theme: DEFAULT_THEME, features: { customThemeEnabled: false } }
    }

    const { rows: [theme] } = await db.query(
      'SELECT primary_color, secondary_color, accent_color, logo_url FROM store_theme WHERE store_id = $1',
      [storeId]
    )

    return {
      theme: theme
        ? {
            primary:   theme.primary_color,
            secondary: theme.secondary_color,
            accent:    theme.accent_color,
            logoUrl:   theme.logo_url,
          }
        : DEFAULT_THEME,
      features: { customThemeEnabled: true },
    }
  })

  // PATCH /store/theme — atualiza o tema (OWNER/MANAGER)
  const themeSchema = z.object({
    primary:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accent:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    logoUrl:   z.string().url().nullable().optional(),
  })

  app.patch('/store/theme', { preHandler: requireStoreUser }, async (req, reply) => {
    if (!['OWNER', 'MANAGER'].includes((req.actor as { role: string }).role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const body    = themeSchema.parse(req.body)
    const storeId = req.actor.storeId

    await db.query(
      `INSERT INTO store_theme (store_id, primary_color, secondary_color, accent_color, logo_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE
       SET primary_color   = COALESCE($2, store_theme.primary_color),
           secondary_color = COALESCE($3, store_theme.secondary_color),
           accent_color    = COALESCE($4, store_theme.accent_color),
           logo_url        = COALESCE($5, store_theme.logo_url),
           updated_at      = now()`,
      [storeId, body.primary, body.secondary, body.accent, body.logoUrl]
    )

    return { ok: true }
  })
}
