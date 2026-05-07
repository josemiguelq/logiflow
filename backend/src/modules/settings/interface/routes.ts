import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'

const DEFAULT_THEME = {
  primary:   '#2563EB',
  secondary: '#F9FAFB',
  accent:    '#F97316',
  logoUrl:   null,
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /store/features — returns all enabled feature flags for the store
  app.get('/store/features', { preHandler: requireStoreUser }, async (req) => {
    const { rows: [f] } = await db.query(
      'SELECT custom_theme_enabled, whatsapp_enabled FROM store_features WHERE store_id = $1',
      [req.actor.storeId]
    )
    return {
      customThemeEnabled: f?.custom_theme_enabled ?? false,
      whatsappEnabled:    f?.whatsapp_enabled     ?? false,
    }
  })

  // GET /store/theme
  app.get('/store/theme', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    const { rows: [features] } = await db.query(
      'SELECT custom_theme_enabled, whatsapp_enabled FROM store_features WHERE store_id = $1',
      [storeId]
    )

    if (!features?.custom_theme_enabled) {
      return {
        theme:    DEFAULT_THEME,
        features: { customThemeEnabled: false, whatsappEnabled: features?.whatsapp_enabled ?? false },
      }
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
      features: { customThemeEnabled: true, whatsappEnabled: features.whatsapp_enabled ?? false },
    }
  })

  // PATCH /store/theme
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

  // GET /store/settings
  app.get('/store/settings', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    const { rows: [store] } = await db.query(
      'SELECT name, lat, lng FROM stores WHERE id = $1',
      [storeId]
    )

    const { rows: [settings] } = await db.query(
      `SELECT max_orders_per_route, require_delivery_photo,
              require_pickup_code, require_delivery_code
       FROM store_settings WHERE store_id = $1`,
      [storeId]
    )

    return {
      storeName:            store?.name ?? '',
      storeLat:             store?.lat  ?? null,
      storeLng:             store?.lng  ?? null,
      maxOrdersPerRoute:    settings?.max_orders_per_route    ?? 5,
      requireDeliveryPhoto: settings?.require_delivery_photo  ?? false,
      requirePickupCode:    settings?.require_pickup_code     ?? true,
      requireDeliveryCode:  settings?.require_delivery_code   ?? true,
    }
  })

  // PATCH /store/settings
  const storeSettingsSchema = z.object({
    maxOrdersPerRoute:    z.number().int().min(1).max(20).optional(),
    requireDeliveryPhoto: z.boolean().optional(),
    requirePickupCode:    z.boolean().optional(),
    requireDeliveryCode:  z.boolean().optional(),
    storeLat:             z.number().optional().nullable(),
    storeLng:             z.number().optional().nullable(),
  })

  app.patch('/store/settings', { preHandler: requireStoreUser }, async (req, reply) => {
    if (!['OWNER', 'MANAGER'].includes((req.actor as { role: string }).role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const body    = storeSettingsSchema.parse(req.body)
    const storeId = req.actor.storeId

    await db.query(
      `INSERT INTO store_settings
         (store_id, max_orders_per_route, require_delivery_photo,
          require_pickup_code, require_delivery_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE
       SET max_orders_per_route    = COALESCE($2, store_settings.max_orders_per_route),
           require_delivery_photo  = COALESCE($3, store_settings.require_delivery_photo),
           require_pickup_code     = COALESCE($4, store_settings.require_pickup_code),
           require_delivery_code   = COALESCE($5, store_settings.require_delivery_code),
           updated_at              = now()`,
      [storeId,
       body.maxOrdersPerRoute    ?? null,
       body.requireDeliveryPhoto ?? null,
       body.requirePickupCode    ?? null,
       body.requireDeliveryCode  ?? null]
    )

    if (body.storeLat !== undefined || body.storeLng !== undefined) {
      await db.query(
        'UPDATE stores SET lat = COALESCE($2, lat), lng = COALESCE($3, lng) WHERE id = $1',
        [storeId, body.storeLat ?? null, body.storeLng ?? null]
      )
    }

    return { ok: true }
  })

  // PATCH /store/me/password
  const passwordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword:     z.string().min(6),
  })

  app.patch('/store/me/password', { preHandler: requireStoreUser }, async (req, reply) => {
    const body   = passwordSchema.parse(req.body)
    const userId = req.actor.sub

    const { rows: [user] } = await db.query(
      'SELECT password_hash FROM store_users WHERE id = $1',
      [userId]
    )

    if (!user) return reply.code(404).send({ error: 'User not found' })

    const valid = await bcrypt.compare(body.currentPassword, user.password_hash as string)
    if (!valid) return reply.code(400).send({ error: 'Senha atual incorreta' })

    const hash = await bcrypt.hash(body.newPassword, 10)
    await db.query('UPDATE store_users SET password_hash = $1 WHERE id = $2', [hash, userId])

    return { ok: true }
  })
}
