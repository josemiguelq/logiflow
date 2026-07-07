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
  customerName: z.string().min(1).transform(s => s.trim()),
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
        customerName:     body.customerName,
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

  // ── Público: visualizar garantia ─────────────────────────────────────────
  app.get('/g/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const warranty = await repo.findByToken(token)
    if (!warranty) return reply.code(404).send({ error: 'Not found' })

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
