import { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { DEFAULT_ROLE_SCOPES } from '../../../shared/scopes'
import { createPgStoreUserRepo } from '../infrastructure/repositories/pg-store-user-repo'
import { createPgDelivererAuthRepo } from '../infrastructure/repositories/pg-deliverer-auth-repo'
import { loginStoreUser } from '../application/use-cases/login-store-user'
import { loginDeliverer } from '../application/use-cases/login-deliverer'
import { loginDelivererV2 } from '../application/use-cases/login-deliverer-v2'
import { isValidDocument, onlyDigits } from '../../../shared/utils/document'
import { isLoginLocked, registerLoginFailure, clearLoginFailures } from '../../../shared/login-throttle'

const TOO_MANY = 'Muitas tentativas de senha. Tente novamente em alguns minutos.'

const loginSchema = z.object({
  email:    z.string().email().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  await app.register(rateLimit, {
    max:         10,
    timeWindow:  '1 minute',
    errorResponseBuilder: () => ({
      error: 'Muitas tentativas. Aguarde 1 minuto e tente novamente.',
    }),
  })

  const storeUserRepo   = createPgStoreUserRepo(db)
  const delivererRepo   = createPgDelivererAuthRepo(db)
  const signJwt = (payload: object) => app.jwt.sign(payload as Record<string, unknown>)

  async function getScopes(storeId: string, role: string): Promise<string[]> {
    const { rows: [row] } = await db.query(
      'SELECT scopes FROM store_role_scopes WHERE store_id = $1 AND role = $2',
      [storeId, role]
    )
    return (row?.scopes as string[] | undefined) ?? DEFAULT_ROLE_SCOPES[role] ?? []
  }

  app.post('/auth/store/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    if (!body.email) return reply.code(400).send({ error: 'email required' })
    if (await isLoginLocked('store', body.email)) return reply.code(429).send({ error: TOO_MANY })
    const jti = randomUUID()
    try {
      const result = await loginStoreUser(
        { email: body.email, password: body.password, jti },
        { storeUserRepo, signJwt, getScopes }
      )
      await clearLoginFailures('store', body.email)

      // Registra a sessão (IP + dispositivo), atualiza o último login e revoga
      // sessões anteriores do mesmo IP+dispositivo (uma ativa por dispositivo).
      const ip = req.ip
      const ua = (req.headers['user-agent'] ?? '').slice(0, 400)
      const uid = result.user.id
      await db.query(
        `UPDATE store_user_sessions SET revoked_at = now()
         WHERE store_user_id = $1 AND ip = $2 AND user_agent = $3 AND revoked_at IS NULL`,
        [uid, ip, ua]
      ).catch(() => { /* non-fatal */ })
      await db.query(
        `INSERT INTO store_user_sessions (id, store_user_id, store_id, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [jti, uid, result.user.storeId, ip, ua]
      ).catch(() => { /* non-fatal */ })
      await db.query(`UPDATE store_users SET last_login_at = now() WHERE id = $1`, [uid])
        .catch(() => { /* non-fatal */ })

      return result
    } catch {
      await registerLoginFailure('store', body.email)
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
  })

  app.post('/auth/deliverer/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    if (!body.username) return reply.code(400).send({ error: 'username required' })
    if (await isLoginLocked('deliverer', body.username)) return reply.code(429).send({ error: TOO_MANY })
    try {
      const result = await loginDeliverer(
        { username: body.username, password: body.password },
        { delivererRepo, signJwt }
      )
      await clearLoginFailures('deliverer', body.username)
      return result
    } catch {
      await registerLoginFailure('deliverer', body.username)
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
  })

  // ── Login v2 do entregador (multi-loja por código de convite) ─────────────

  // Resolve uma loja pelo código de convite (público). Usado pelo app para
  // mostrar o nome da loja antes de logar e salvar a loja localmente.
  const findStoreByCode = async (code: string) => {
    const { rows: [s] } = await db.query(
      'SELECT id, name, invite_code FROM stores WHERE invite_code = $1 LIMIT 1',
      [code]
    )
    return s ? { id: s.id as string, name: s.name as string, code: s.invite_code as string } : null
  }

  app.get('/auth/store/by-code/:code', async (req, reply) => {
    const { code } = req.params as { code: string }
    const store = await findStoreByCode(code.trim().toUpperCase())
    if (!store) return reply.code(404).send({ error: 'Loja não encontrada' })
    return { storeId: store.id, storeName: store.name, code: store.code }
  })

  const loginV2Schema = z.object({
    storeCode: z.string().min(1),
    username:  z.string().min(1),
    password:  z.string().min(1),
  })

  app.post('/auth/deliverer/login/v2', async (req, reply) => {
    const body = loginV2Schema.parse(req.body)
    const id = `${body.storeCode}:${body.username}`
    if (await isLoginLocked('deliverer', id)) return reply.code(429).send({ error: TOO_MANY })
    try {
      const result = await loginDelivererV2(body, { delivererRepo, findStoreByCode, signJwt })
      await clearLoginFailures('deliverer', id)
      return result
    } catch {
      await registerLoginFailure('deliverer', id)
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
  })

  // ── Self-service store registration ───────────────────────────────────────

  // Cria loja + papéis (scopes) + usuário OWNER numa transação. Retorna token+user.
  async function createStoreWithOwner(input: {
    storeName: string; ownerName: string; email: string; password: string
    cpfCnpj?: string | null; address?: string | null; lat?: number | null; lng?: number | null
    planId?: string | null
  }) {
    const hash     = await bcrypt.hash(input.password, 10)
    const username = input.email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9_.]/g, '_')

    const { storeId, user } = await db.transaction(async (client) => {
      const { rows: [store] } = await client.query(
        `INSERT INTO stores (name, cpf_cnpj, street, lat, lng, plan_id, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, (now() + INTERVAL '3 months')::DATE)
         RETURNING id`,
        [input.storeName, input.cpfCnpj ?? null, input.address ?? null, input.lat ?? null, input.lng ?? null, input.planId ?? null]
      )
      // Sincroniza as features do plano escolhido (limites + features)
      if (input.planId) {
        await client.query(
          `INSERT INTO store_features_enabled (store_id, feature_id)
           SELECT $1, feature_id FROM plan_features WHERE plan_id = $2
           ON CONFLICT DO NOTHING`,
          [store.id, input.planId]
        )
      }
      for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
        await client.query(
          `INSERT INTO store_role_scopes (store_id, role, scopes)
           VALUES ($1, $2, $3) ON CONFLICT (store_id, role) DO NOTHING`,
          [store.id, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])]
        )
      }
      const { rows: [u] } = await client.query(
        `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, 'OWNER')
         RETURNING id, name, email, role`,
        [store.id, input.ownerName, input.email, username, hash]
      )
      return { storeId: store.id as string, user: u as { id: string; name: string; email: string; role: string } }
    })

    const scopes = DEFAULT_ROLE_SCOPES['OWNER'] ?? []
    const token  = signJwt({ type: 'store_user', sub: user.id, storeId, role: 'OWNER', name: user.name, scopes })
    return { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, storeId, scopes } }
  }

  const registerSchema = z.object({
    storeName: z.string().min(2),
    ownerName: z.string().min(2),
    email:     z.string().email(),
    password:  z.string().min(6),
  })

  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)
    const { rows: [existing] } = await db.query('SELECT id FROM store_users WHERE email = $1', [body.email])
    if (existing) return reply.code(409).send({ error: 'E-mail já está em uso' })
    return reply.code(201).send(await createStoreWithOwner(body))
  })

  // ── Planos ativos (público — usado no wizard de cadastro) ─────────────────
  app.get('/plans', async () => {
    const { rows } = await db.query(`
      SELECT p.id, p.name, p.price_cents, p.max_deliverers, p.max_orders_per_month,
             COALESCE(
               (SELECT jsonb_agg(f.name ORDER BY f.name)
                FROM plan_features pf JOIN features f ON f.id = pf.feature_id
                WHERE pf.plan_id = p.id),
               '[]'::jsonb
             ) AS features
      FROM plans p
      WHERE p.is_active = true
      ORDER BY p.sort_order ASC, p.name ASC
    `)
    return rows.map((r: Record<string, unknown>) => ({
      id:                r.id,
      name:              r.name,
      priceCents:        Number(r.price_cents ?? 0),
      maxDeliverers:     r.max_deliverers       != null ? Number(r.max_deliverers)       : null,
      maxOrdersPerMonth: r.max_orders_per_month != null ? Number(r.max_orders_per_month) : null,
      features:          (r.features as string[] | null) ?? [],
    }))
  })

  // ── Cadastro em etapas (prospects) ────────────────────────────────────────
  const prospectStep1 = z.object({
    storeName: z.string().min(2),
    cpfCnpj:   z.string().min(11),
    email:     z.string().email(),
  })

  app.post('/auth/prospect', async (req, reply) => {
    const body = prospectStep1.parse(req.body)
    if (!isValidDocument(body.cpfCnpj)) return reply.code(400).send({ error: 'CPF/CNPJ inválido' })
    const { rows: [u] } = await db.query('SELECT id FROM store_users WHERE email = $1', [body.email])
    if (u) return reply.code(409).send({ error: 'E-mail já está em uso' })

    const doc = onlyDigits(body.cpfCnpj)
    // Continua o mesmo prospect ao retomar com o mesmo e-mail (sem duplicar).
    const { rows: [existing] } = await db.query(
      `SELECT id FROM prospects WHERE email = $1 AND status <> 'CONVERTED' LIMIT 1`, [body.email]
    )
    if (existing) {
      await db.query(
        `UPDATE prospects SET store_name = $2, cpf_cnpj = $3, status = 'STEP1', updated_at = now() WHERE id = $1`,
        [existing.id, body.storeName, doc]
      )
      return { id: existing.id }
    }
    const { rows: [p] } = await db.query(
      `INSERT INTO prospects (store_name, cpf_cnpj, email, status) VALUES ($1, $2, $3, 'STEP1') RETURNING id`,
      [body.storeName, doc, body.email]
    )
    return { id: p.id }
  })

  const prospectStep2 = z.object({
    address: z.string().optional(),
    lat:     z.number().optional(),
    lng:     z.number().optional(),
  })

  app.patch('/auth/prospect/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = prospectStep2.parse(req.body)
    const { rowCount } = await db.query(
      `UPDATE prospects SET address = $2, lat = $3, lng = $4, status = 'STEP2', updated_at = now()
       WHERE id = $1 AND status <> 'CONVERTED'`,
      [id, body.address ?? null, body.lat ?? null, body.lng ?? null]
    )
    if (!rowCount) return reply.code(404).send({ error: 'Cadastro não encontrado' })
    return { ok: true }
  })

  const convertSchema = z.object({
    ownerName: z.string().min(2),
    password:  z.string().min(6),
    planId:    z.string().uuid().nullable().optional(),
  })

  app.post('/auth/prospect/:id/convert', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = convertSchema.parse(req.body)

    const { rows: [p] } = await db.query('SELECT * FROM prospects WHERE id = $1', [id])
    if (!p) return reply.code(404).send({ error: 'Cadastro não encontrado' })
    if (p.status === 'CONVERTED') return reply.code(409).send({ error: 'Cadastro já concluído' })
    if (!p.email || !p.store_name) return reply.code(400).send({ error: 'Cadastro incompleto' })

    const { rows: [u] } = await db.query('SELECT id FROM store_users WHERE email = $1', [p.email])
    if (u) return reply.code(409).send({ error: 'E-mail já está em uso' })

    let planId: string | null = null
    if (body.planId) {
      const { rows: [plan] } = await db.query(
        'SELECT id FROM plans WHERE id = $1 AND is_active = true', [body.planId]
      )
      if (!plan) return reply.code(400).send({ error: 'Plano inválido' })
      planId = body.planId
    }

    const result = await createStoreWithOwner({
      storeName: p.store_name, ownerName: body.ownerName, email: p.email, password: body.password,
      cpfCnpj: p.cpf_cnpj, address: p.address, lat: p.lat, lng: p.lng, planId,
    })
    await db.query(
      `UPDATE prospects SET status = 'CONVERTED', owner_name = $2, converted_store_id = $3, updated_at = now() WHERE id = $1`,
      [id, body.ownerName, result.user.storeId]
    )
    return reply.code(201).send(result)
  })
}
