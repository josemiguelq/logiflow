import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope, requireFeature } from '../../../shared/middleware/rbac'
import { uploadBase64, resolveImageUrl } from '../../../shared/storage/client'
import { createPgGarantiaRepo, ClientStandingStatus } from '../infrastructure/repositories/pg-garantia-repo'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

const createBodySchema = z.object({
  customerId: z.string().uuid(),
})

const answersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    label: z.string(),
    answer: z.boolean(),
  })),
  signature: z.string().min(1),
})

// ── Gate público por telefone (últimos 4 dígitos) ──────────────────────────
// Mesmo padrão do rastreio público (/tracking/:orderId): a senha são os 4
// últimos dígitos do telefone do cliente, enviada no header X-Tracking-Code.
function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function phoneGateOk(phone: string | null, provided: string | undefined): boolean {
  const expected = onlyDigits(phone).slice(-4)
  // Sem telefone (ou telefone curto): impossível proteger — libera o acesso.
  if (expected.length < 4) return true
  return onlyDigits(provided).slice(-4) === expected
}

// Máscara para ajudar o cliente a lembrar o telefone: mostra os primeiros
// dígitos e esconde os 4 últimos, preservando a formatação original.
// Ex.: "(11) 98765-4321" → "(11) 98765-••••".
function maskPhoneHint(phone: string | null): string {
  if (!phone) return ''
  if (onlyDigits(phone).length < 4) return ''
  let remaining = 4
  const chars = phone.split('')
  for (let i = chars.length - 1; i >= 0 && remaining > 0; i--) {
    if (/\d/.test(chars[i])) { chars[i] = '•'; remaining-- }
  }
  return chars.join('')
}

export async function garantiaRoutes(app: FastifyInstance) {
  const repo = createPgGarantiaRepo(db)

  // Feature "warranties" habilitada para a loja? (gating do fluxo público — o
  // operador é bloqueado pelo preHandler requireFeature).
  async function warrantyFeatureOn(storeId: string): Promise<boolean> {
    const { rows } = await db.query(
      `SELECT 1 FROM store_features_enabled sfe
       JOIN features f ON f.id = sfe.feature_id
       WHERE sfe.store_id = $1 AND f.name = 'warranties' LIMIT 1`,
      [storeId],
    )
    return rows.length > 0
  }

  // ── Operador: listar garantias (1 linha por cliente) ─────────────────────
  app.get(
    '/garantias',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:view')] },
    async (req) => {
      const { customerName, status, page } = req.query as {
        customerName?: string
        status?: string
        page?: string
      }
      const validStatus: ClientStandingStatus[] = ['confirmed', 'pending', 'outdated']
      return repo.listClientStanding(req.actor.storeId, {
        customerName: customerName?.trim() || undefined,
        status: validStatus.includes(status as ClientStandingStatus)
          ? (status as ClientStandingStatus)
          : undefined,
        page: page ? parseInt(page, 10) : undefined,
      })
    },
  )

  // ── Operador: config (rascunho + versão atual) ───────────────────────────
  app.get(
    '/garantias/config',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:view')] },
    async (req) => {
      const draft = await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      const current = await repo.getCurrentVersion(req.actor.storeId)
      // O rascunho difere da versão publicada? (perguntas ou vídeo mudaram, ou
      // ainda não há nenhuma versão publicada)
      const draftDirty = !current
        || current.videoUrl !== draft.videoUrl
        || JSON.stringify(current.questions) !== JSON.stringify(draft.questions)
      return {
        id:                 draft.id,
        storeId:            draft.storeId,
        videoUrl:           draft.videoUrl,
        questions:          draft.questions,
        currentVersion:     current?.version ?? null,
        currentPublishedAt: current?.publishedAt ?? null,
        draftDirty,
      }
    },
  )

  const updateConfigSchema = z.object({
    videoUrl: z.string().url().nullable(),
    questions: z.array(z.object({
      id: z.string(),
      label: z.string().min(1),
      required: z.boolean(),
    })).min(1),
  })

  app.put(
    '/garantias/config',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:manage')] },
    async (req) => {
      const body = updateConfigSchema.parse(req.body)
      await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      return repo.updateQuestionSet(req.actor.storeId, {
        videoUrl: body.videoUrl,
        questions: body.questions,
        updatedBy: req.actor.sub,
        updatedByName: req.actor.name,
      })
    },
  )

  // ── Operador: publicar nova versão dos termos ────────────────────────────
  app.post(
    '/garantias/config/publish',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:manage')] },
    async (req) => {
      // Garante que o rascunho exista antes de publicar.
      await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      return repo.publishVersion(req.actor.storeId, { sub: req.actor.sub, name: req.actor.name })
    },
  )

  // ── Operador: detalhe do cliente (histórico de aceites) ──────────────────
  app.get(
    '/garantias/:customerId',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:view')] },
    async (req, reply) => {
      const { customerId } = req.params as { customerId: string }
      const customer = await repo.getCustomerBasic(req.actor.storeId, customerId)
      if (!customer) return reply.code(404).send({ error: 'Not found' })

      // Somente leitura: não cria link ao apenas visualizar o detalhe.
      const link = await repo.findClientLink(req.actor.storeId, customerId)
      const current = await repo.getCurrentVersion(req.actor.storeId)
      const acceptances = await repo.listAcceptancesByCustomer(req.actor.storeId, customerId)

      const resolved = await Promise.all(
        acceptances.map(async (a) => ({
          ...a,
          signaturePath: a.signaturePath ? await resolveImageUrl(a.signaturePath) : null,
        })),
      )

      return {
        customerId,
        customerName: customer.name,
        token: link?.token ?? null,
        currentVersion: current?.version ?? null,
        acceptances: resolved,
      }
    },
  )

  // ── Operador: QR code do link do cliente ─────────────────────────────────
  app.get(
    '/garantias/:customerId/qrcode',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:view')] },
    async (req, reply) => {
      const { customerId } = req.params as { customerId: string }
      const customer = await repo.getCustomerBasic(req.actor.storeId, customerId)
      if (!customer) return reply.code(404).send({ error: 'Not found' })

      const link = await repo.getOrCreateClientLink(req.actor.storeId, customerId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      const publicUrl = `${FRONTEND_URL}/g/${link.token}`
      const qrDataUrl = await QRCode.toDataURL(publicUrl)
      return { qrDataUrl, publicUrl }
    },
  )

  // ── Operador: gerar/obter link de garantia do cliente ────────────────────
  app.post(
    '/garantias',
    { preHandler: [requireStoreUser, requireFeature('warranties'), requireScope('warranties:manage')] },
    async (req, reply) => {
      const body = createBodySchema.parse(req.body)

      const customer = await repo.getCustomerBasic(req.actor.storeId, body.customerId)
      if (!customer) return reply.code(404).send({ error: 'Customer not found' })

      const link = await repo.getOrCreateClientLink(req.actor.storeId, body.customerId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })

      // Garante que a loja tenha uma versão de termos publicada (bootstrap da
      // v1 a partir do rascunho) para que o link já funcione ao ser aberto.
      await repo.ensureCurrentVersion(req.actor.storeId, { sub: req.actor.sub, name: req.actor.name })

      const publicUrl = `${FRONTEND_URL}/g/${link.token}`
      const qrDataUrl = await QRCode.toDataURL(publicUrl)

      return reply.code(201).send({
        id:        link.id,
        token:     link.token,
        publicUrl,
        shortLink: publicUrl,
        qrDataUrl,
      })
    },
  )

  // ── Público: visualizar garantia ─────────────────────────────────────────
  app.get('/g/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const client = await repo.findClientByToken(token)
    if (!client) return reply.code(404).send({ error: 'Not found' })
    if (!(await warrantyFeatureOn(client.storeId))) return reply.code(404).send({ error: 'Not found' })

    // Operador autenticado ignora o gate (preview). Cliente informa os 4
    // últimos dígitos do telefone via header X-Tracking-Code.
    let isAuthenticated = false
    try { await req.jwtVerify(); isAuthenticated = true } catch { /* acesso público */ }
    if (!isAuthenticated) {
      if (!phoneGateOk(client.phone, req.headers['x-tracking-code'] as string | undefined)) {
        reply.header('WWW-Authenticate', 'TrackingCode realm="garantia"')
        return reply.code(401).send({ error: 'password_required', phoneHint: maskPhoneHint(client.phone) })
      }
    }

    const version = await repo.ensureCurrentVersion(client.storeId, { sub: null, name: null })

    const acceptance = await repo.getOrCreateAcceptanceForCurrent(
      client.storeId,
      { id: client.customerId, name: client.customerName },
      { sub: null, name: null },
    )

    const { rows } = await db.query(
      `SELECT s.name, t.primary_color, t.secondary_color, t.accent_color, t.logo_url
       FROM stores s
       LEFT JOIN store_theme t ON t.store_id = s.id
       WHERE s.id = $1`,
      [client.storeId],
    )
    const store = rows[0] as Record<string, unknown> | undefined
    const storeTheme = store
      ? {
          storeName: store.name as string | null,
          logoUrl: store.logo_url ? await resolveImageUrl(store.logo_url as string) : null,
          primary: (store.primary_color as string) ?? '#111827',
          secondary: (store.secondary_color as string) ?? '#374151',
          accent: (store.accent_color as string) ?? '#3B82F6',
        }
      : null

    if (acceptance && acceptance.status === 'confirmed') {
      return {
        status: 'confirmed',
        storeTheme,
        customerName: client.customerName,
        videoUrl: version.videoUrl,
        questions: acceptance.questionsSnapshot ?? version.questions,
        answers: acceptance.answers,
        confirmedAt: acceptance.confirmedAt,
        signaturePath: acceptance.signaturePath
          ? await resolveImageUrl(acceptance.signaturePath)
          : null,
      }
    }

    return {
      status: 'pending',
      customerName: client.customerName,
      videoUrl: version.videoUrl,
      questions: version.questions,
      storeTheme,
    }
  })

  // ── Público: confirmar garantia ──────────────────────────────────────────
  app.post('/g/:token/confirm', async (req, reply) => {
    const { token } = req.params as { token: string }
    const body = answersSchema.parse(req.body)

    const client = await repo.findClientByToken(token)
    if (!client) return reply.code(404).send({ error: 'Not found' })
    if (!(await warrantyFeatureOn(client.storeId))) return reply.code(404).send({ error: 'Not found' })

    // Mesmo gate do GET: o token sozinho não confirma sem os 4 dígitos do telefone.
    let isAuthenticated = false
    try { await req.jwtVerify(); isAuthenticated = true } catch { /* acesso público */ }
    if (!isAuthenticated) {
      if (!phoneGateOk(client.phone, req.headers['x-tracking-code'] as string | undefined)) {
        return reply.code(401).send({ error: 'password_required', phoneHint: maskPhoneHint(client.phone) })
      }
    }

    const acceptance = await repo.getOrCreateAcceptanceForCurrent(
      client.storeId,
      { id: client.customerId, name: client.customerName },
      { sub: null, name: null },
    )
    if (!acceptance) return reply.code(404).send({ error: 'no_terms' })
    if (acceptance.status === 'confirmed') {
      return reply.code(409).send({ error: 'Já confirmado' })
    }

    const signaturePath = await uploadBase64(
      `garantias/${acceptance.id}/rubrica`,
      body.signature,
    )

    const confirmed = await repo.confirmAcceptance(acceptance.id, {
      answers: body.answers,
      signaturePath,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    })

    if (!confirmed) return reply.code(409).send({ error: 'Já confirmado' })

    return { ok: true, confirmedAt: confirmed.confirmedAt }
  })
}
