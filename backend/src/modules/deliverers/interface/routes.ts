import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireRole, requireScope } from '../../../shared/middleware/rbac'
import { createPgDelivererRepo } from '../infrastructure/repositories/pg-deliverer-repo'
import { createPgDeviceTokenRepo } from '../../notifications/infrastructure/repositories/pg-device-token-repo'
import { assertCanAddDeliverer, invalidateDelivererCount } from '../../../shared/plan-limits'
import { DELIVERER_TERMS } from '../../legal/deliverer-terms'

const DELIVERERS_TTL = 30 // seconds — mesma janela usada no cache de /orders

function delivererListVersionKey(storeId: string) {
  return `deliverers:ver:${storeId}`
}

// Mesmo padrão do cache de /orders: versão em vez de KEYS/scan pra invalidar.
async function delivererListVersion(storeId: string): Promise<string> {
  try {
    return (await redis.get(delivererListVersionKey(storeId))) ?? '0'
  } catch {
    return '0'
  }
}

async function invalidateDelivererList(storeId: string): Promise<void> {
  try { await redis.incr(delivererListVersionKey(storeId)) } catch { /* non-fatal */ }
}

// Lookup por id usado em /deliverers/:id/history — mesma chave de versão da
// listagem, então qualquer mutação que invalide a lista invalida isto junto.
async function findDelivererCached(storeId: string, id: string) {
  const version  = await delivererListVersion(storeId)
  const cacheKey = `deliverers:byid:${storeId}:${id}:v${version}`
  try {
    const raw = await redis.get(cacheKey)
    if (raw) return JSON.parse(raw)
  } catch { /* fall through to DB */ }

  const { rows: [d] } = await db.query(
    `SELECT id, name, username, email, status, profile_image_url, is_active, created_at,
            terms_accepted_at, terms_accepted_version
     FROM deliverers WHERE id = $1 AND store_id = $2`,
    [id, storeId]
  )
  if (d) redis.setex(cacheKey, DELIVERERS_TTL, JSON.stringify(d)).catch(() => {})
  return d
}

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

// Username é único por loja: a violação dispara o código 23505 do Postgres.
function isUsernameConflict(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23505'
}

export async function delivererRoutes(app: FastifyInstance) {
  const repo = createPgDelivererRepo(db, {
    onListMutation: (storeId) => { invalidateDelivererList(storeId).catch(() => {}) },
  })

  app.get(
    '/deliverers',
    { preHandler: requireStoreUser },
    async (req) => {
      const version  = await delivererListVersion(req.actor.storeId)
      const cacheKey = `deliverers:list:${req.actor.storeId}:v${version}`
      try {
        const raw = await redis.get(cacheKey)
        if (raw) return JSON.parse(raw)
      } catch { /* fall through to DB */ }

      const deliverers = await repo.findByStore(req.actor.storeId)
      redis.setex(cacheKey, DELIVERERS_TTL, JSON.stringify(deliverers)).catch(() => {})
      return deliverers
    }
  )

  // Código de convite da loja: o entregador digita no app (login v2) para
  // selecionar a loja. Exibido no painel para o gestor compartilhar.
  app.get(
    '/deliverers/invite-code',
    { preHandler: requireStoreUser },
    async (req) => {
      const { rows: [s] } = await db.query(
        'SELECT invite_code FROM stores WHERE id = $1',
        [req.actor.storeId]
      )
      return { code: (s as { invite_code: string } | undefined)?.invite_code ?? null }
    }
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
      try {
        await assertCanAddDeliverer(db, req.actor.storeId)
      } catch (err: unknown) {
        return reply.code(403).send({ error: (err as Error).message })
      }
      let deliverer
      try {
        deliverer = await repo.create({ storeId: req.actor.storeId, ...body })
      } catch (err: unknown) {
        if (isUsernameConflict(err)) {
          return reply.code(409).send({ error: 'Já existe um entregador com esse username nesta loja' })
        }
        throw err
      }
      await invalidateDelivererCount(req.actor.storeId)
      return reply.code(201).send(deliverer)
    }
  )

  app.patch(
    '/deliverers/:id',
    { preHandler: [requireStoreUser, requireRole('MANAGER')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = updateSchema.parse(req.body)
      let deliverer
      try {
        deliverer = await repo.update(id, req.actor.storeId, body)
      } catch (err: unknown) {
        if (isUsernameConflict(err)) {
          return reply.code(409).send({ error: 'Já existe um entregador com esse username nesta loja' })
        }
        throw err
      }
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
      if (active) {
        try {
          await assertCanAddDeliverer(db, req.actor.storeId)
        } catch (err: unknown) {
          return reply.code(403).send({ error: (err as Error).message })
        }
      }
      await repo.setActive(id, req.actor.storeId, active)
      await invalidateDelivererCount(req.actor.storeId)
      return reply.send({ ok: true })
    }
  )

  // Soft delete: exclui o entregador sem apagar a linha, preservando os pedidos.
  app.delete(
    '/deliverers/:id',
    { preHandler: [requireStoreUser, requireScope('deliverers:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const ok = await repo.softDelete(id, req.actor.storeId, req.actor.sub)
      if (!ok) return reply.code(404).send({ error: 'Entregador não encontrado' })
      await invalidateDelivererCount(req.actor.storeId)
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
           AND status NOT IN ('DELIVERED','CANCELLED')
           AND deleted_at IS NULL`,
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
        `SELECT id, name, username, store_id, status, profile_image_url, needs_onboarding,
                needs_switch_tour, terms_accepted_version
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
        needsSwitchTour: d.needs_switch_tour as boolean,
        termsAccepted:   (d.terms_accepted_version as string | null) === DELIVERER_TERMS.version,
      }
    }
  )

  // ── Termo de uso do entregador ────────────────────────────────────────────
  // Texto servido do backend (versionado em deliverer-terms.ts). `accepted` diz
  // se a versão aceita pelo entregador é a atual.
  app.get('/deliverer/terms', { preHandler: requireDeliverer }, async (req) => {
    const { rows: [d] } = await db.query(
      'SELECT terms_accepted_version FROM deliverers WHERE id = $1',
      [req.actor.sub]
    )
    return {
      version:  DELIVERER_TERMS.version,
      content:  DELIVERER_TERMS.content,
      accepted: (d?.terms_accepted_version as string | null) === DELIVERER_TERMS.version,
    }
  })

  // Registra o aceite (auditável: versão, data, IP, user-agent) e marca a versão
  // aceita no entregador.
  app.post('/deliverer/terms/accept', { preHandler: requireDeliverer }, async (req, reply) => {
    const version   = DELIVERER_TERMS.version
    const userAgent = req.headers['user-agent'] ?? null
    await db.query(
      `INSERT INTO deliverer_terms_acceptance (deliverer_id, store_id, version, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.actor.sub, req.actor.storeId, version, req.ip, userAgent]
    )
    await repo.acceptTerms(req.actor.sub, req.actor.storeId, version)
    return reply.send({ ok: true, version })
  })

  // Marca o guia (coach-mark) do switch de disponibilidade como visto.
  app.post('/deliverer/onboarding/switch-tour/seen', { preHandler: requireDeliverer }, async (req, reply) => {
    await db.query(
      'UPDATE deliverers SET needs_switch_tour = false WHERE id = $1',
      [req.actor.sub]
    )
    return reply.send({ ok: true })
  })

  // Deliverer updates own profile (name, photo, password) and clears onboarding flag
  const profileSchema = z.object({
    name:            z.string().min(1).optional(),
    profileImageUrl: z.string().optional(),
    currentPassword: z.string().optional(),
    newPassword:     z.string().min(6).optional(),
  })

  app.patch('/deliverer/profile', { preHandler: requireDeliverer }, async (req, reply) => {
    const body = profileSchema.parse(req.body)
    let passwordHash: string | undefined

    if (body.newPassword) {
      if (body.currentPassword) {
        const { rows: [d] } = await db.query(
          'SELECT password_hash FROM deliverers WHERE id = $1', [req.actor.sub]
        )
        const valid = await bcrypt.compare(body.currentPassword, (d as Record<string, unknown>)?.password_hash as string ?? '')
        if (!valid) return reply.code(400).send({ error: 'Senha atual incorreta' })
      }
      passwordHash = await bcrypt.hash(body.newPassword, 10)
    }

    await repo.updateProfile(req.actor.sub, req.actor.storeId, {
      name:            body.name,
      profileImageUrl: body.profileImageUrl,
      passwordHash,
    })
    return reply.send({ ok: true })
  })

  // Store user fetches a single deliverer with their status history
  app.get(
    '/deliverers/:id/history',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const d = await findDelivererCached(req.actor.storeId, id)
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
         WHERE deliverer_id = $1 AND store_id = $2 AND deleted_at IS NULL`,
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
        termsAcceptedAt:      d.terms_accepted_at,
        termsAcceptedVersion: d.terms_accepted_version,
        termsCurrent:         d.terms_accepted_version === DELIVERER_TERMS.version,
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
      maxProofPhotos:       parseInt(sv.max_proof_photos ?? '2', 10) || 1,
      // Limiares (min) das bandeiras de atraso — o app colore os cards com base neles.
      delayPrepYellowMin:    parseInt(sv.delay_prep_yellow_min    ?? '20', 10) || 20,
      delayPrepRedMin:       parseInt(sv.delay_prep_red_min       ?? '30', 10) || 30,
      delayTransitYellowMin: parseInt(sv.delay_transit_yellow_min ?? '50', 10) || 50,
      delayTransitRedMin:    parseInt(sv.delay_transit_red_min    ?? '60', 10) || 60,
      deliveryProximityMeters:  parseInt(sv.delivery_proximity_meters ?? '100', 10) || 100,
      deliveryRequireProximity: sv.delivery_require_proximity === 'true',
      enforceDeliveryOrder:     sv.enforce_delivery_order     === 'true',
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

  // ── Device metadata (modelo, SO, versão do app) ───────────────────────────

  const deviceInfoSchema = z.object({
    model:      z.string().min(1).max(200),
    os:         z.string().min(1).max(100),
    appVersion: z.string().min(1).max(50),
  })

  app.post(
    '/deliverer/device-info',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { model, os, appVersion } = deviceInfoSchema.parse(req.body)
      await repo.updateDeviceInfo(req.actor.sub, { model, os, appVersion })
      return reply.code(204).send()
    }
  )
}
