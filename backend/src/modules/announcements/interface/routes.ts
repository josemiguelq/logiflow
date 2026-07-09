import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser, requireDeliverer } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'

// Aceita '#RRGGBB' (3/6/8 dígitos) ou vazio/nulo.
const colorSchema = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/).nullable().optional()

const announcementSchema = z.object({
  title:           z.string().max(120).nullable().optional(),
  body:            z.string().max(4000),
  emoji:           z.string().max(8).nullable().optional(),
  accentColor:     colorSchema,
  backgroundColor: colorSchema,
  textColor:       colorSchema,
  active:          z.boolean().optional(),
  expiresAt:       z.string().datetime().nullable().optional(),
})

function mapRow(r: Record<string, unknown>) {
  return {
    id:              r.id as string,
    title:           r.title as string | null,
    body:            r.body as string,
    emoji:           r.emoji as string | null,
    accentColor:     r.accent_color as string | null,
    backgroundColor: r.background_color as string | null,
    textColor:       r.text_color as string | null,
    active:          r.active as boolean,
    expiresAt:       r.expires_at as string | null,
    createdByName:   r.created_by_name as string | null,
    createdAt:       r.created_at as string,
  }
}

export async function announcementRoutes(app: FastifyInstance) {
  // ── Operador ───────────────────────────────────────────────────────────────

  app.get(
    '/announcements',
    { preHandler: [requireStoreUser, requireScope('announcements:manage')] },
    async (req) => {
      const { rows } = await db.query(
        `SELECT * FROM announcements WHERE store_id = $1 ORDER BY created_at DESC`,
        [req.actor.storeId]
      )
      return rows.map(mapRow)
    }
  )

  app.post(
    '/announcements',
    { preHandler: [requireStoreUser, requireScope('announcements:manage')] },
    async (req, reply) => {
      const b = announcementSchema.parse(req.body)
      const { rows } = await db.query(
        `INSERT INTO announcements
           (store_id, title, body, emoji, accent_color, background_color, text_color,
            active, expires_at, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [req.actor.storeId, b.title ?? null, b.body, b.emoji ?? null,
         b.accentColor ?? null, b.backgroundColor ?? null, b.textColor ?? null,
         b.active ?? true, b.expiresAt ?? null, req.actor.sub, req.actor.name]
      )
      return reply.code(201).send(mapRow(rows[0]))
    }
  )

  app.patch(
    '/announcements/:id',
    { preHandler: [requireStoreUser, requireScope('announcements:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const b = announcementSchema.partial().parse(req.body)
      const { rows } = await db.query(
        `UPDATE announcements SET
           title            = COALESCE($3, title),
           body             = COALESCE($4, body),
           emoji            = COALESCE($5, emoji),
           accent_color     = COALESCE($6, accent_color),
           background_color = COALESCE($7, background_color),
           text_color       = COALESCE($8, text_color),
           active           = COALESCE($9, active),
           expires_at       = CASE WHEN $10::boolean THEN $11::timestamptz ELSE expires_at END,
           updated_at       = now()
         WHERE id = $1 AND store_id = $2
         RETURNING *`,
        [id, req.actor.storeId, b.title ?? null, b.body ?? null, b.emoji ?? null,
         b.accentColor ?? null, b.backgroundColor ?? null, b.textColor ?? null,
         b.active ?? null,
         // flag explícito para permitir limpar (NULL) o expires_at
         b.expiresAt !== undefined, b.expiresAt ?? null]
      )
      if (!rows[0]) return reply.code(404).send({ error: 'Comunicado não encontrado' })
      return mapRow(rows[0])
    }
  )

  app.delete(
    '/announcements/:id',
    { preHandler: [requireStoreUser, requireScope('announcements:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const { rowCount } = await db.query(
        `DELETE FROM announcements WHERE id = $1 AND store_id = $2`,
        [id, req.actor.storeId]
      )
      if (!rowCount) return reply.code(404).send({ error: 'Comunicado não encontrado' })
      return reply.send({ ok: true })
    }
  )

  // ── Entregador ───────────────────────────────────────────────────────────────

  // Comunicados ativos, não expirados e ainda não lidos por este entregador.
  app.get(
    '/deliverer/announcements',
    { preHandler: requireDeliverer },
    async (req) => {
      const { rows } = await db.query(
        `SELECT a.* FROM announcements a
         WHERE a.store_id = $1 AND a.active = true
           AND (a.expires_at IS NULL OR a.expires_at > now())
           AND NOT EXISTS (
             SELECT 1 FROM announcement_reads r
             WHERE r.announcement_id = a.id AND r.deliverer_id = $2
           )
         ORDER BY a.created_at DESC`,
        [req.actor.storeId, req.actor.sub]
      )
      return rows.map(mapRow)
    }
  )

  app.post(
    '/deliverer/announcements/:id/read',
    { preHandler: requireDeliverer },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      // Garante que o comunicado é da loja do entregador antes de marcar.
      const { rows } = await db.query(
        `INSERT INTO announcement_reads (announcement_id, deliverer_id)
         SELECT a.id, $2 FROM announcements a WHERE a.id = $1 AND a.store_id = $3
         ON CONFLICT DO NOTHING
         RETURNING announcement_id`,
        [id, req.actor.sub, req.actor.storeId]
      )
      // rows vazio = já lido (conflito) ou inexistente: idempotente, ok.
      return reply.send({ ok: true, marked: rows.length > 0 })
    }
  )
}
