import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import QRCode from 'qrcode'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { uploadBase64, resolveImageUrl } from '../../../shared/storage/client'
import { createPgGarantiaRepo } from '../infrastructure/repositories/pg-garantia-repo'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000'

const createBodySchema = z.object({
  customerId: z.string().uuid(),
  parts: z.array(z.string().min(1)).min(1),
  saleAt: z.string().datetime().optional(),
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

  // ── Operador: listar garantias ───────────────────────────────────────────
  app.get(
    '/garantias',
    { preHandler: [requireStoreUser, requireScope('warranties:view')] },
    async (req) => {
      const { customerName, dateFrom, dateTo, page } = req.query as {
        customerName?: string
        dateFrom?: string
        dateTo?: string
        page?: string
      }
      return repo.findByStore(req.actor.storeId, {
        customerName: customerName?.trim() || undefined,
        dateFrom,
        dateTo,
        page: page ? parseInt(page, 10) : undefined,
      })
    },
  )

  // ── Operador: detalhe da garantia ────────────────────────────────────────
  app.get(
    '/garantias/:id',
    { preHandler: [requireStoreUser, requireScope('warranties:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const warranty = await repo.findById(id, req.actor.storeId)
      if (!warranty) return reply.code(404).send({ error: 'Not found' })
      return {
        ...warranty,
        signaturePath: warranty.signaturePath
          ? await resolveImageUrl(warranty.signaturePath)
          : null,
      }
    },
  )

  // ── Operador: QR code da garantia ────────────────────────────────────────
  app.get(
    '/garantias/:id/qrcode',
    { preHandler: [requireStoreUser, requireScope('warranties:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const warranty = await repo.findById(id, req.actor.storeId)
      if (!warranty) return reply.code(404).send({ error: 'Not found' })
      const publicUrl = `${FRONTEND_URL}/g/${warranty.token}`
      const qrDataUrl = await QRCode.toDataURL(publicUrl)
      return { qrDataUrl, publicUrl }
    },
  )

  // ── Operador: criar garantia ─────────────────────────────────────────────
  app.post(
    '/garantias',
    { preHandler: [requireStoreUser, requireScope('warranties:manage')] },
    async (req, reply) => {
      const body = createBodySchema.parse(req.body)

      const questionSet = await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })

      const warranty = await repo.create({
        storeId:          req.actor.storeId,
        customerId:       body.customerId,
        parts:            body.parts,
        saleAt:           body.saleAt ? new Date(body.saleAt) : new Date(),
        questionsSnapshot: questionSet.questions,
        createdBy:        req.actor.sub,
        createdByName:    req.actor.name,
      })

      const publicUrl = `${FRONTEND_URL}/g/${warranty.token}`
      const qrDataUrl = await QRCode.toDataURL(publicUrl)

      return reply.code(201).send({
        id:        warranty.id,
        token:     warranty.token,
        publicUrl,
        shortLink: publicUrl,
        qrDataUrl,
      })
    },
  )

  // ── Operador: config (question set) ─────────────────────────────────────
  app.get(
    '/garantias/config',
    { preHandler: [requireStoreUser, requireScope('warranties:view')] },
    async (req) => {
      const questionSet = await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      return questionSet
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
    { preHandler: [requireStoreUser, requireScope('warranties:manage')] },
    async (req, reply) => {
      const body = updateConfigSchema.parse(req.body)
      await repo.getOrCreateQuestionSet(req.actor.storeId, {
        sub: req.actor.sub,
        name: req.actor.name,
      })
      const updated = await repo.updateQuestionSet(req.actor.storeId, {
        videoUrl: body.videoUrl,
        questions: body.questions,
        updatedBy: req.actor.sub,
        updatedByName: req.actor.name,
      })
      return updated
    },
  )

  // ── Público: visualizar garantia ─────────────────────────────────────────
  app.get('/g/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const warranty = await repo.findByToken(token)
    if (!warranty) return reply.code(404).send({ error: 'Not found' })

    // Operador autenticado ignora o gate (preview). Cliente informa os 4
    // últimos dígitos do telefone via header X-Tracking-Code.
    let isAuthenticated = false
    try { await req.jwtVerify(); isAuthenticated = true } catch { /* acesso público */ }
    if (!isAuthenticated) {
      const phone = await repo.findCustomerPhoneByToken(token)
      if (!phoneGateOk(phone, req.headers['x-tracking-code'] as string | undefined)) {
        reply.header('WWW-Authenticate', 'TrackingCode realm="garantia"')
        return reply.code(401).send({ error: 'password_required', phoneHint: maskPhoneHint(phone) })
      }
    }

    const questionSet = await repo.getOrCreateQuestionSet(warranty.storeId, {
      sub: null,
      name: null,
    })

    const { rows } = await db.query(
      `SELECT s.name, t.primary_color, t.secondary_color, t.accent_color, t.logo_url
       FROM stores s
       LEFT JOIN store_theme t ON t.store_id = s.id
       WHERE s.id = $1`,
      [warranty.storeId],
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

    if (warranty.status === 'confirmed') {
      return {
        status: 'confirmed',
        storeTheme,
        customerName: warranty.customerName,
        parts: warranty.parts,
        saleAt: warranty.saleAt,
        confirmedAt: warranty.confirmedAt,
        videoUrl: questionSet.videoUrl,
        questions: questionSet.questions,
        answers: warranty.answers,
        signaturePath: warranty.signaturePath
          ? await resolveImageUrl(warranty.signaturePath)
          : null,
      }
    }

    return {
      status: 'pending',
      customerName: warranty.customerName,
      parts: warranty.parts,
      saleAt: warranty.saleAt,
      videoUrl: questionSet.videoUrl,
      questions: questionSet.questions,
      storeTheme,
    }
  })

  // ── Público: confirmar garantia ──────────────────────────────────────────
  app.post('/g/:token/confirm', async (req, reply) => {
    const { token } = req.params as { token: string }
    const body = answersSchema.parse(req.body)

    const warranty = await repo.findByToken(token)
    if (!warranty) return reply.code(404).send({ error: 'Not found' })

    // Mesmo gate do GET: o token sozinho não confirma sem os 4 dígitos do telefone.
    let isAuthenticated = false
    try { await req.jwtVerify(); isAuthenticated = true } catch { /* acesso público */ }
    if (!isAuthenticated) {
      const phone = await repo.findCustomerPhoneByToken(token)
      if (!phoneGateOk(phone, req.headers['x-tracking-code'] as string | undefined)) {
        return reply.code(401).send({ error: 'password_required', phoneHint: maskPhoneHint(phone) })
      }
    }

    if (warranty.status === 'confirmed') {
      return reply.code(409).send({ error: 'Já confirmado' })
    }

    const signaturePath = await uploadBase64(
      `garantias/${warranty.id}/rubrica`,
      body.signature,
    )

    const confirmed = await repo.confirm(token, {
      answers: body.answers,
      signaturePath,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    })

    if (!confirmed) return reply.code(409).send({ error: 'Já confirmado' })

    return { ok: true, confirmedAt: confirmed.confirmedAt }
  })
}
