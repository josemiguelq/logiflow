import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { uploadBase64, resolveImageUrl } from '../../../shared/storage/client'
import { billingStatus } from '../../../shared/billing'

const DEFAULT_THEME = {
  primary:   '#2563EB',
  secondary: '#F9FAFB',
  accent:    '#F97316',
  logoUrl:   null as string | null,
  storeName: null as string | null,
}

function themeCacheKey(storeId: string) {
  return `theme:store:${storeId}`
}

export async function settingsRoutes(app: FastifyInstance) {
  // GET /store/features — returns all enabled feature flags for the store
  app.get('/store/features', { preHandler: requireStoreUser }, async (req) => {
    const { rows } = await db.query(`
      SELECT f.name FROM store_features_enabled sfe
      JOIN features f ON f.id = sfe.feature_id
      WHERE sfe.store_id = $1
    `, [req.actor.storeId])
    const names = rows.map((r: Record<string, unknown>) => r.name as string)
    return {
      whatsappEnabled:        names.includes('whatsapp'),
      customThemeEnabled:     names.includes('custom_theme'),
      csvExportEnabled:       names.includes('csv_export'),
      customerRatingsEnabled: names.includes('customer_ratings'),
    }
  })

  // GET /store/theme
  app.get('/store/theme', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    // Redis cache
    // Cache stores raw logoPath (not a signed URL) so it never expires before the signed URL does.
    let cached: { theme: Record<string, unknown> | null; features: Record<string, unknown>; storeName: string | null } | null = null
    try {
      const raw = await redis.get(themeCacheKey(storeId))
      if (raw) cached = JSON.parse(raw)
    } catch { /* redis unavailable — fall through to DB */ }

    if (!cached) {
      const { rows: featureRows } = await db.query(`
        SELECT f.name FROM store_features_enabled sfe
        JOIN features f ON f.id = sfe.feature_id
        WHERE sfe.store_id = $1
      `, [storeId])
      const featureNames      = featureRows.map((r: Record<string, unknown>) => r.name as string)
      const customThemeEnabled = featureNames.includes('custom_theme')
      const whatsappEnabled    = featureNames.includes('whatsapp')
      const csvExportEnabled   = featureNames.includes('csv_export')

      const { rows: [store] } = await db.query(
        'SELECT name FROM stores WHERE id = $1',
        [storeId]
      )
      const storeName = (store?.name as string | null) ?? null

      let themeRow: Record<string, unknown> | null = null
      if (customThemeEnabled) {
        const { rows: [t] } = await db.query(
          'SELECT primary_color, secondary_color, accent_color, logo_url FROM store_theme WHERE store_id = $1',
          [storeId]
        )
        themeRow = t ?? null
      }

      cached = {
        theme: themeRow
          ? {
              primary:   themeRow.primary_color,
              secondary: themeRow.secondary_color,
              accent:    themeRow.accent_color,
              logoPath:  themeRow.logo_url ?? null,   // raw path — signed at serve time
            }
          : null,
        features: { customThemeEnabled, whatsappEnabled, csvExportEnabled },
        storeName,
      }

      try {
        await redis.setex(themeCacheKey(storeId), 3600, JSON.stringify(cached))
      } catch { /* ignore */ }
    }

    const t = cached.theme
    return {
      theme: t
        ? {
            primary:   t.primary,
            secondary: t.secondary,
            accent:    t.accent,
            logoUrl:   await resolveImageUrl(t.logoPath as string | null),
            storeName: cached.storeName,
          }
        : { ...DEFAULT_THEME, storeName: cached.storeName },
      features: cached.features,
    }
  })

  // PATCH /store/theme
  const themeSchema = z.object({
    primary:   z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    accent:    z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    logoUrl:   z.string().nullable().optional(),
  })

  app.patch('/store/theme', { preHandler: requireStoreUser }, async (req, reply) => {
    if (!['OWNER', 'MANAGER'].includes((req.actor as { role: string }).role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const body    = themeSchema.parse(req.body)
    const storeId = req.actor.storeId
    const hasLogo = 'logoUrl' in (req.body as object)

    // Upload logo to storage if sent as base64 data URI
    let logoUrl = body.logoUrl ?? null
    if (logoUrl?.startsWith('data:')) {
      try {
        logoUrl = await uploadBase64(`logos/${storeId}`, logoUrl)
      } catch (uploadErr) {
        req.log.error({ err: uploadErr }, 'logo upload failed')
        return reply.code(502).send({ error: 'Falha ao salvar logo. Verifique se o bucket de storage está configurado.' })
      }
    }

    await db.query(
      `INSERT INTO store_theme (store_id, primary_color, secondary_color, accent_color, logo_url)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (store_id) DO UPDATE
       SET primary_color   = COALESCE($2, store_theme.primary_color),
           secondary_color = COALESCE($3, store_theme.secondary_color),
           accent_color    = COALESCE($4, store_theme.accent_color),
           logo_url        = CASE WHEN $6 THEN $5 ELSE store_theme.logo_url END,
           updated_at      = now()`,
      [storeId, body.primary, body.secondary, body.accent, logoUrl, hasLogo]
    )

    try { await redis.del(themeCacheKey(storeId)) } catch { /* ignore */ }

    return { ok: true }
  })

  // GET /store/settings
  app.get('/store/settings', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    const [{ rows: [store] }, { rows: settingRows }] = await Promise.all([
      db.query('SELECT name, lat, lng FROM stores WHERE id = $1', [storeId]),
      db.query(
        `SELECT s.name, COALESCE(ssv.value, s.default_value) AS value
         FROM settings s
         LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1`,
        [storeId]
      ),
    ])

    const s = Object.fromEntries(
      settingRows.map((r: Record<string, unknown>) => [r.name as string, r.value as string])
    )

    return {
      storeName:            (store as Record<string, unknown> | undefined)?.name ?? '',
      storeLat:             (store as Record<string, unknown> | undefined)?.lat  ?? null,
      storeLng:             (store as Record<string, unknown> | undefined)?.lng  ?? null,
      maxOrdersPerRoute:    parseInt(s.max_orders_per_route    ?? '5'),
      requireDeliveryPhoto:    s.require_delivery_photo    === 'true',
      requirePickupCode:        s.require_pickup_code        !== 'false',
      requireDeliveryCode:      s.require_delivery_code      !== 'false',
      allowCustomerRatings:     s.allow_customer_ratings     === 'true',
      paymentMethodsEnabled:    s.payment_methods_enabled    === 'true',
    }
  })

  // PATCH /store/settings
  const storeSettingsSchema = z.object({
    storeName:            z.string().min(1).optional(),
    maxOrdersPerRoute:    z.number().int().min(1).max(20).optional(),
    requireDeliveryPhoto:  z.boolean().optional(),
    requirePickupCode:     z.boolean().optional(),
    requireDeliveryCode:   z.boolean().optional(),
    allowCustomerRatings:  z.boolean().optional(),
    paymentMethodsEnabled: z.boolean().optional(),
    storeLat:              z.number().optional().nullable(),
    storeLng:              z.number().optional().nullable(),
  })

  app.patch('/store/settings', { preHandler: requireStoreUser }, async (req, reply) => {
    if (!['OWNER', 'MANAGER'].includes((req.actor as { role: string }).role)) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const body    = storeSettingsSchema.parse(req.body)
    const storeId = req.actor.storeId

    const upsertSetting = (name: string, value: string) =>
      db.query(
        `INSERT INTO store_setting_values (store_id, setting_id, value)
         SELECT $1, id, $2 FROM settings WHERE name = $3
         ON CONFLICT (store_id, setting_id) DO UPDATE SET value = EXCLUDED.value`,
        [storeId, value, name]
      )

    const simpleMap: [keyof typeof body, string][] = [
      ['maxOrdersPerRoute',    'max_orders_per_route'],
      ['requireDeliveryPhoto', 'require_delivery_photo'],
      ['requirePickupCode',    'require_pickup_code'],
      ['requireDeliveryCode',  'require_delivery_code'],
      ['paymentMethodsEnabled','payment_methods_enabled'],
    ]
    for (const [key, dbName] of simpleMap) {
      if (body[key] !== undefined) await upsertSetting(dbName, String(body[key]))
    }

    if (body.allowCustomerRatings !== undefined) {
      const { rows } = await db.query(`
        SELECT 1 FROM store_features_enabled sfe
        JOIN features f ON f.id = sfe.feature_id
        WHERE sfe.store_id = $1 AND f.name = 'customer_ratings'
      `, [storeId])
      if (rows.length > 0) await upsertSetting('allow_customer_ratings', String(body.allowCustomerRatings))
    }

    const storeUpdates: string[] = []
    const storeParams: unknown[] = [storeId]
    let storeIdx = 2

    if (body.storeName) {
      storeUpdates.push(`name = $${storeIdx++}`)
      storeParams.push(body.storeName)
    }
    if (body.storeLat !== undefined) {
      storeUpdates.push(`lat = $${storeIdx++}`)
      storeParams.push(body.storeLat ?? null)
    }
    if (body.storeLng !== undefined) {
      storeUpdates.push(`lng = $${storeIdx++}`)
      storeParams.push(body.storeLng ?? null)
    }
    if (storeUpdates.length > 0) {
      await db.query(`UPDATE stores SET ${storeUpdates.join(', ')} WHERE id = $1`, storeParams)
      // Bust theme cache so the new name is reflected immediately in the app
      if (body.storeName) {
        try { await redis.del(themeCacheKey(storeId)) } catch { /* ignore */ }
      }
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

  // ── Store user management (OWNER/MANAGER only) ─────────────────────────────

  app.get('/store/users', { preHandler: [requireStoreUser, requireScope('users:view')] }, async (req) => {
    const { rows } = await db.query(
      `SELECT id, name, email, username, role, created_at
       FROM store_users WHERE store_id = $1 ORDER BY created_at ASC`,
      [req.actor.storeId]
    )
    return rows.map((r: Record<string, unknown>) => ({
      id:        r.id,
      name:      r.name,
      email:     r.email,
      username:  r.username,
      role:      r.role,
      createdAt: r.created_at,
    }))
  })

  const createUserSchema = z.object({
    name:     z.string().min(2),
    email:    z.string().email(),
    username: z.string().min(3).regex(/^[a-z0-9_.]+$/),
    password: z.string().min(6),
    role:     z.enum(['MANAGER', 'ASSISTANT']),
  })

  app.post('/store/users', { preHandler: [requireStoreUser, requireScope('users:create')] }, async (req, reply) => {
    const actor = req.actor as { role: string; storeId: string; sub: string }
    const body = createUserSchema.parse(req.body)

    const { rows: [dup] } = await db.query(
      'SELECT id FROM store_users WHERE (email = $1 OR username = $2) AND store_id = $3',
      [body.email, body.username, actor.storeId]
    )
    if (dup) return reply.code(409).send({ error: 'Email ou username já em uso nesta loja' })

    const hash = await bcrypt.hash(body.password, 10)
    const { rows: [user] } = await db.query(
      `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, username, role, created_at`,
      [actor.storeId, body.name, body.email, body.username, hash, body.role]
    )
    return reply.code(201).send(user)
  })

  // GET /store/billing
  app.get('/store/billing', { preHandler: requireStoreUser }, async (req) => {
    const storeId = req.actor.storeId

    const [{ rows: [store] }, { rows: paymentRows }, { rows: featureRows }] = await Promise.all([
      db.query('SELECT trial_ends_at, billing_day FROM stores WHERE id = $1', [storeId]),
      db.query('SELECT reference_month FROM store_payments WHERE store_id = $1', [storeId]),
      db.query(`
        SELECT f.name FROM store_features_enabled sfe
        JOIN features f ON f.id = sfe.feature_id
        WHERE sfe.store_id = $1
      `, [storeId]),
    ])

    const paidMonths   = paymentRows.map((r: Record<string, unknown>) => r.reference_month as string)
    const featureNames = featureRows.map((r: Record<string, unknown>) => r.name as string)

    const bs = billingStatus(
      {
        trial_ends_at: store?.trial_ends_at ? new Date(store.trial_ends_at as string) : null,
        billing_day:   (store?.billing_day as number | null) ?? null,
      },
      paidMonths
    )

    let trialDaysLeft: number | null = null
    if (bs.status === 'trial' && bs.trialEndsAt) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const end = new Date(bs.trialEndsAt)
      trialDaysLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
    }

    // Derive plan label from enabled features
    const hasWhatsapp    = featureNames.includes('whatsapp')
    const hasCustomTheme = featureNames.includes('custom_theme')
    let planLabel: string
    if (hasCustomTheme) {
      planLabel = 'Pro Premium'
    } else if (hasWhatsapp) {
      planLabel = 'Pro + WhatsApp'
    } else {
      planLabel = 'Starter'
    }

    return { ...bs, trialDaysLeft, planLabel }
  })

  app.delete('/store/users/:id', { preHandler: [requireStoreUser, requireScope('users:delete')] }, async (req, reply) => {
    const actor = req.actor as { role: string; storeId: string; sub: string }
    const { id } = req.params as { id: string }
    if (id === actor.sub) return reply.code(400).send({ error: 'Não é possível remover a si mesmo' })

    const { rows: [target] } = await db.query(
      'SELECT role FROM store_users WHERE id = $1 AND store_id = $2',
      [id, actor.storeId]
    )
    if (!target) return reply.code(404).send({ error: 'Usuário não encontrado' })
    if (actor.role === 'MANAGER' && (target.role as string) !== 'ASSISTANT') {
      return reply.code(403).send({ error: 'Managers só podem remover assistentes' })
    }

    await db.query('DELETE FROM store_users WHERE id = $1 AND store_id = $2', [id, actor.storeId])
    return { ok: true }
  })
}
