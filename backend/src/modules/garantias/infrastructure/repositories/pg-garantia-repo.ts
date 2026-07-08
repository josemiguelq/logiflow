import { DB } from '../../../../shared/db/client'
import { generateCode } from '../../../../shared/utils/code-generator'
import {
  WarrantyQuestionSet,
  WarrantyQuestion,
  WarrantyAnswer,
  WarrantyTermsVersion,
  WarrantyClientLink,
  WarrantyAcceptance,
} from '../../domain/entities'
import { DEFAULT_WARRANTY_QUESTIONS, DEFAULT_VIDEO_URL } from '../../domain/questions-template'

const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuuAAAAACEEEEIIIINOOOOOUUUU'

type Actor = { sub: string | null; name: string | null }

// Status derivado exibido no painel do operador (1 linha por cliente).
export type ClientStandingStatus = 'confirmed' | 'pending' | 'outdated'

export interface WarrantyClientStanding {
  customerId: string
  customerName: string
  status: ClientStandingStatus
  currentVersion: number | null
  lastConfirmedVersion: number | null
  lastConfirmedAt: Date | null
}

function mapQuestionSetRow(r: Record<string, unknown>): WarrantyQuestionSet {
  return {
    id:             r.id as string,
    storeId:        r.store_id as string,
    videoUrl:       r.video_url as string | null,
    questions:      r.questions as WarrantyQuestion[],
    createdBy:      r.created_by as string | null,
    createdByName:  r.created_by_name as string | null,
    updatedBy:      r.updated_by as string | null,
    updatedByName:  r.updated_by_name as string | null,
    createdAt:      r.created_at as Date,
    updatedAt:      r.updated_at as Date,
  }
}

function mapVersionRow(r: Record<string, unknown>): WarrantyTermsVersion {
  return {
    id:              r.id as string,
    storeId:         r.store_id as string,
    version:         Number(r.version),
    videoUrl:        r.video_url as string | null,
    questions:       r.questions as WarrantyQuestion[],
    isCurrent:       r.is_current as boolean,
    publishedBy:     r.published_by as string | null,
    publishedByName: r.published_by_name as string | null,
    publishedAt:     r.published_at as Date,
  }
}

function mapLinkRow(r: Record<string, unknown>): WarrantyClientLink {
  return {
    id:            r.id as string,
    storeId:       r.store_id as string,
    customerId:    r.customer_id as string,
    token:         r.token as string,
    createdBy:     r.created_by as string | null,
    createdByName: r.created_by_name as string | null,
    createdAt:     r.created_at as Date,
  }
}

function mapAcceptanceRow(r: Record<string, unknown>): WarrantyAcceptance {
  return {
    id:                r.id as string,
    storeId:           r.store_id as string,
    customerId:        r.customer_id as string,
    customerName:      r.customer_name as string,
    termsVersionId:    r.terms_version_id as string,
    termsVersion:      Number(r.terms_version),
    status:            r.status as 'pending' | 'confirmed',
    questionsSnapshot: r.questions_snapshot as WarrantyQuestion[] | null,
    answers:           r.answers as WarrantyAnswer[] | null,
    signaturePath:     r.signature_path as string | null,
    responseIp:        r.response_ip as string | null,
    responseUserAgent: r.response_user_agent as string | null,
    confirmedAt:       r.confirmed_at as Date | null,
    createdBy:         r.created_by as string | null,
    createdByName:     r.created_by_name as string | null,
    createdAt:         r.created_at as Date,
  }
}

export function createPgGarantiaRepo(db: DB) {
  return {
    // ── Rascunho editável (1 por loja) ─────────────────────────────────────
    async getOrCreateQuestionSet(storeId: string, actor: Actor): Promise<WarrantyQuestionSet> {
      const existing = await db.query(
        `SELECT * FROM warranty_question_sets WHERE store_id = $1`,
        [storeId],
      )
      if (existing.rows[0]) {
        return mapQuestionSetRow(existing.rows[0] as Record<string, unknown>)
      }

      const { rows } = await db.query(
        `INSERT INTO warranty_question_sets (store_id, video_url, questions, created_by, created_by_name)
         VALUES ($1, $2, $3::jsonb, $4, $5) RETURNING *`,
        [storeId, DEFAULT_VIDEO_URL, JSON.stringify(DEFAULT_WARRANTY_QUESTIONS), actor.sub, actor.name],
      )
      return mapQuestionSetRow(rows[0] as Record<string, unknown>)
    },

    async updateQuestionSet(
      storeId: string,
      data: {
        videoUrl: string | null
        questions: WarrantyQuestion[]
        updatedBy: string | null
        updatedByName: string | null
      },
    ): Promise<WarrantyQuestionSet> {
      const { rows } = await db.query(
        `UPDATE warranty_question_sets
         SET video_url = $2, questions = $3::jsonb, updated_by = $4, updated_by_name = $5, updated_at = now()
         WHERE store_id = $1 RETURNING *`,
        [storeId, data.videoUrl, JSON.stringify(data.questions), data.updatedBy, data.updatedByName],
      )
      return mapQuestionSetRow(rows[0] as Record<string, unknown>)
    },

    // ── Versões publicadas ─────────────────────────────────────────────────
    async getCurrentVersion(storeId: string): Promise<WarrantyTermsVersion | null> {
      const { rows } = await db.query(
        `SELECT * FROM warranty_terms_versions WHERE store_id = $1 AND is_current`,
        [storeId],
      )
      return rows[0] ? mapVersionRow(rows[0] as Record<string, unknown>) : null
    },

    async listVersions(storeId: string): Promise<WarrantyTermsVersion[]> {
      const { rows } = await db.query(
        `SELECT * FROM warranty_terms_versions WHERE store_id = $1 ORDER BY version DESC`,
        [storeId],
      )
      return (rows as Record<string, unknown>[]).map(mapVersionRow)
    },

    // Publica uma nova versão a partir do rascunho atual (snapshot imutável).
    async publishVersion(storeId: string, actor: Actor): Promise<WarrantyTermsVersion> {
      return db.transaction(async (client) => {
        const draft = await client.query(
          `SELECT video_url, questions FROM warranty_question_sets WHERE store_id = $1`,
          [storeId],
        )
        if (!draft.rows[0]) throw new Error('Draft question set not found')
        const d = draft.rows[0] as Record<string, unknown>

        await client.query(
          `UPDATE warranty_terms_versions SET is_current = false WHERE store_id = $1 AND is_current`,
          [storeId],
        )

        const { rows } = await client.query(
          `INSERT INTO warranty_terms_versions
             (store_id, version, video_url, questions, is_current, published_by, published_by_name)
           VALUES (
             $1,
             COALESCE((SELECT MAX(version) FROM warranty_terms_versions WHERE store_id = $1), 0) + 1,
             $2, $3::jsonb, true, $4, $5
           )
           RETURNING *`,
          [storeId, d.video_url, JSON.stringify(d.questions), actor.sub, actor.name],
        )
        return mapVersionRow(rows[0] as Record<string, unknown>)
      })
    },

    // ── Link estável por cliente ───────────────────────────────────────────
    async getCustomerBasic(storeId: string, customerId: string): Promise<{ id: string; name: string } | null> {
      const { rows } = await db.query(
        `SELECT id, name FROM customers WHERE id = $1 AND store_id = $2 AND deleted_at IS NULL`,
        [customerId, storeId],
      )
      return rows[0] ? { id: (rows[0] as Record<string, unknown>).id as string, name: (rows[0] as Record<string, unknown>).name as string } : null
    },

    async getOrCreateClientLink(storeId: string, customerId: string, actor: Actor): Promise<WarrantyClientLink> {
      const existing = await db.query(
        `SELECT * FROM warranty_client_links WHERE store_id = $1 AND customer_id = $2`,
        [storeId, customerId],
      )
      if (existing.rows[0]) {
        return mapLinkRow(existing.rows[0] as Record<string, unknown>)
      }

      let token: string
      let attempts = 0
      do {
        token = generateCode(10)
        const { rows } = await db.query('SELECT id FROM warranty_client_links WHERE token = $1', [token])
        if (rows.length === 0) break
        attempts++
      } while (attempts < 5)

      const { rows } = await db.query(
        `INSERT INTO warranty_client_links (store_id, customer_id, token, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (store_id, customer_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
         RETURNING *`,
        [storeId, customerId, token!, actor.sub, actor.name],
      )
      return mapLinkRow(rows[0] as Record<string, unknown>)
    },

    // Resolve o cliente (e telefone p/ o gate público) a partir do token do link.
    async findClientByToken(token: string): Promise<{
      storeId: string
      customerId: string
      customerName: string
      phone: string | null
    } | null> {
      const { rows } = await db.query(
        `SELECT l.store_id, l.customer_id, c.name, c.phone
         FROM warranty_client_links l
         JOIN customers c ON c.id = l.customer_id
         WHERE l.token = $1`,
        [token],
      )
      if (!rows[0]) return null
      const r = rows[0] as Record<string, unknown>
      return {
        storeId:      r.store_id as string,
        customerId:   r.customer_id as string,
        customerName: r.name as string,
        phone:        r.phone as string | null,
      }
    },

    // ── Aceites ────────────────────────────────────────────────────────────
    // Retorna (ou cria, lazy) o aceite do cliente para a versão atual dos
    // termos. null se a loja ainda não publicou nenhuma versão.
    async getOrCreateAcceptanceForCurrent(
      storeId: string,
      customer: { id: string; name: string },
      actor: Actor,
    ): Promise<WarrantyAcceptance | null> {
      const version = await this.getCurrentVersion(storeId)
      if (!version) return null

      // INSERT idempotente: se dois acessos concorrentes chegarem juntos, o
      // UNIQUE (store_id, customer_id, terms_version_id) garante 1 linha só.
      await db.query(
        `INSERT INTO warranty_acceptances
           (store_id, customer_id, customer_name, terms_version_id, terms_version, questions_snapshot, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         ON CONFLICT (store_id, customer_id, terms_version_id) DO NOTHING`,
        [
          storeId, customer.id, customer.name, version.id, version.version,
          JSON.stringify(version.questions), actor.sub, actor.name,
        ],
      )

      const { rows } = await db.query(
        `SELECT * FROM warranty_acceptances
         WHERE store_id = $1 AND customer_id = $2 AND terms_version_id = $3`,
        [storeId, customer.id, version.id],
      )
      return rows[0] ? mapAcceptanceRow(rows[0] as Record<string, unknown>) : null
    },

    async listAcceptancesByCustomer(storeId: string, customerId: string): Promise<WarrantyAcceptance[]> {
      const { rows } = await db.query(
        `SELECT * FROM warranty_acceptances
         WHERE store_id = $1 AND customer_id = $2
         ORDER BY terms_version DESC`,
        [storeId, customerId],
      )
      return (rows as Record<string, unknown>[]).map(mapAcceptanceRow)
    },

    async confirmAcceptance(
      acceptanceId: string,
      data: { answers: WarrantyAnswer[]; signaturePath: string; ip: string; userAgent: string | null },
    ): Promise<WarrantyAcceptance | null> {
      const { rows } = await db.query(
        `UPDATE warranty_acceptances
         SET status = 'confirmed',
             answers = $2::jsonb,
             signature_path = $3,
             response_ip = $4,
             response_user_agent = $5,
             confirmed_at = now()
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [acceptanceId, JSON.stringify(data.answers), data.signaturePath, data.ip, data.userAgent],
      )
      return rows[0] ? mapAcceptanceRow(rows[0] as Record<string, unknown>) : null
    },

    // ── Painel do operador: 1 linha por cliente ────────────────────────────
    async listClientStanding(
      storeId: string,
      filters: { customerName?: string; status?: ClientStandingStatus; page?: number },
    ): Promise<{ items: WarrantyClientStanding[]; total: number; page: number; pages: number }> {
      const page = Math.max(1, filters.page ?? 1)
      const limit = 20
      const offset = (page - 1) * limit

      const conditions: string[] = ['l.store_id = $1']
      const params: unknown[] = [storeId]
      let p = 2

      if (filters.customerName) {
        conditions.push(
          `translate(c.name, $${p}, $${p + 1}) ILIKE translate($${p + 2}, $${p}, $${p + 1})`,
        )
        params.push(ACCENTS, PLAIN, `%${filters.customerName}%`)
        p += 3
      }

      const where = conditions.join(' AND ')

      // Query interna: computa o status derivado por cliente.
      const inner = `
        SELECT
          l.customer_id,
          c.name AS customer_name,
          (SELECT version FROM warranty_terms_versions WHERE store_id = l.store_id AND is_current) AS current_version,
          lc.last_confirmed_version,
          lc.last_confirmed_at,
          CASE
            WHEN ca.status = 'confirmed' THEN 'confirmed'
            WHEN lc.last_confirmed_version IS NOT NULL THEN 'outdated'
            ELSE 'pending'
          END AS derived_status
        FROM warranty_client_links l
        JOIN customers c ON c.id = l.customer_id
        LEFT JOIN LATERAL (
          SELECT MAX(terms_version) AS last_confirmed_version, MAX(confirmed_at) AS last_confirmed_at
          FROM warranty_acceptances a
          WHERE a.store_id = l.store_id AND a.customer_id = l.customer_id AND a.status = 'confirmed'
        ) lc ON true
        LEFT JOIN LATERAL (
          SELECT status FROM warranty_acceptances a
          WHERE a.store_id = l.store_id AND a.customer_id = l.customer_id
            AND a.terms_version = (SELECT version FROM warranty_terms_versions WHERE store_id = l.store_id AND is_current)
          LIMIT 1
        ) ca ON true
        WHERE ${where}
      `

      const statusFilter = filters.status ? `WHERE t.derived_status = $${p}` : ''
      const statusParams = filters.status ? [filters.status] : []

      const countResult = await db.query(
        `SELECT COUNT(*) FROM (${inner}) t ${statusFilter}`,
        [...params, ...statusParams],
      )
      const total = parseInt((countResult.rows[0] as Record<string, unknown>).count as string, 10)
      const pages = Math.ceil(total / limit) || 1

      const limitParam = p + statusParams.length
      const { rows } = await db.query(
        `SELECT * FROM (${inner}) t ${statusFilter}
         ORDER BY CASE t.derived_status WHEN 'outdated' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, t.customer_name
         LIMIT $${limitParam} OFFSET $${limitParam + 1}`,
        [...params, ...statusParams, limit, offset],
      )

      const items: WarrantyClientStanding[] = (rows as Record<string, unknown>[]).map((r) => ({
        customerId:           r.customer_id as string,
        customerName:         r.customer_name as string,
        status:               r.derived_status as ClientStandingStatus,
        currentVersion:       r.current_version != null ? Number(r.current_version) : null,
        lastConfirmedVersion: r.last_confirmed_version != null ? Number(r.last_confirmed_version) : null,
        lastConfirmedAt:      r.last_confirmed_at as Date | null,
      }))

      return { items, total, page, pages }
    },
  }
}
