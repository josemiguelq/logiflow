import { DB } from '../../../../shared/db/client'
import { generateCode } from '../../../../shared/utils/code-generator'
import { WarrantyQuestionSet, Warranty, WarrantyAnswer } from '../../domain/entities'
import { DEFAULT_WARRANTY_QUESTIONS, DEFAULT_VIDEO_URL } from '../../domain/questions-template'

const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuuAAAAACEEEEIIIINOOOOOUUUU'

function mapQuestionSetRow(r: Record<string, unknown>): WarrantyQuestionSet {
  return {
    id:             r.id as string,
    storeId:        r.store_id as string,
    videoUrl:       r.video_url as string | null,
    questions:      r.questions as { id: string; label: string; required: boolean }[],
    createdBy:      r.created_by as string | null,
    createdByName:  r.created_by_name as string | null,
    updatedBy:      r.updated_by as string | null,
    updatedByName:  r.updated_by_name as string | null,
    createdAt:      r.created_at as Date,
    updatedAt:      r.updated_at as Date,
  }
}

function mapWarrantyRow(r: Record<string, unknown>): Warranty {
  return {
    id:                r.id as string,
    storeId:           r.store_id as string,
    token:             r.token as string,
    customerId:        r.customer_id as string | null,
    customerName:      r.customer_name as string,
    parts:             r.parts as string[],
    saleAt:            r.sale_at as Date,
    status:            r.status as 'pending' | 'confirmed',
    questionsSnapshot: r.questions_snapshot as { id: string; label: string; required: boolean }[] | null,
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
    async getOrCreateQuestionSet(
      storeId: string,
      actor: { sub: string | null; name: string | null },
    ): Promise<WarrantyQuestionSet> {
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

    async create(data: {
      storeId: string
      customerId: string
      parts: string[]
      saleAt: Date
      questionsSnapshot: { id: string; label: string; required: boolean }[]
      createdBy: string | null
      createdByName: string | null
    }): Promise<Warranty> {
      const { rows: [customer] } = await db.query(
        'SELECT name FROM customers WHERE id = $1 AND store_id = $2',
        [data.customerId, data.storeId],
      )
      if (!customer) throw new Error('Customer not found')
      const customerName = (customer as Record<string, unknown>).name as string

      let token: string
      let attempts = 0
      do {
        token = generateCode(10)
        const { rows } = await db.query('SELECT id FROM warranties WHERE token = $1', [token])
        if (rows.length === 0) break
        attempts++
      } while (attempts < 5)

      const { rows } = await db.query(
        `INSERT INTO warranties (store_id, token, customer_id, customer_name, parts, sale_at, questions_snapshot, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, $8, $9) RETURNING *`,
        [
          data.storeId,
          token,
          data.customerId,
          customerName,
          JSON.stringify(data.parts),
          data.saleAt,
          JSON.stringify(data.questionsSnapshot),
          data.createdBy,
          data.createdByName,
        ],
      )
      return mapWarrantyRow(rows[0] as Record<string, unknown>)
    },

    async findByStore(
      storeId: string,
      filters: {
        customerName?: string
        dateFrom?: string
        dateTo?: string
        page?: number
      },
    ): Promise<{ items: Warranty[]; total: number; page: number; pages: number }> {
      const page = Math.max(1, filters.page ?? 1)
      const limit = 20
      const offset = (page - 1) * limit

      const conditions: string[] = ['store_id = $1']
      const params: unknown[] = [storeId]
      let paramIdx = 2

      const joinCustomer = !!filters.customerName
      let joinClause = ''
      if (joinCustomer) {
        joinClause = 'JOIN customers c ON c.id = w.customer_id'
        conditions.push(`translate(c.name, $${paramIdx}, $${paramIdx + 1}) ILIKE translate($${paramIdx + 2}, $${paramIdx}, $${paramIdx + 1})`)
        params.push(ACCENTS, PLAIN, `%${filters.customerName}%`)
        paramIdx += 3
      }

      if (filters.dateFrom) {
        conditions.push(`w.sale_at >= $${paramIdx}`)
        params.push(filters.dateFrom)
        paramIdx++
      }

      if (filters.dateTo) {
        conditions.push(`w.sale_at <= $${paramIdx}`)
        params.push(filters.dateTo)
        paramIdx++
      }

      const where = conditions.join(' AND ')

      const countResult = await db.query(
        `SELECT COUNT(*) FROM warranties w ${joinClause} WHERE ${where}`,
        params,
      )
      const total = parseInt((countResult.rows[0] as Record<string, unknown>).count as string, 10)
      const pages = Math.ceil(total / limit) || 1

      const { rows } = await db.query(
        `SELECT w.* FROM warranties w ${joinClause} WHERE ${where} ORDER BY w.created_at DESC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset],
      )

      return {
        items: (rows as Record<string, unknown>[]).map(mapWarrantyRow),
        total,
        page,
        pages,
      }
    },

    async findById(id: string, storeId: string): Promise<Warranty | null> {
      const { rows } = await db.query(
        `SELECT * FROM warranties WHERE id = $1 AND store_id = $2`,
        [id, storeId],
      )
      return rows[0] ? mapWarrantyRow(rows[0] as Record<string, unknown>) : null
    },

    async findByToken(token: string): Promise<Warranty | null> {
      const { rows } = await db.query(
        `SELECT * FROM warranties WHERE token = $1`,
        [token],
      )
      return rows[0] ? mapWarrantyRow(rows[0] as Record<string, unknown>) : null
    },

    async updateQuestionSet(
      storeId: string,
      data: {
        videoUrl: string | null
        questions: { id: string; label: string; required: boolean }[]
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

    async confirm(
      token: string,
      data: {
        answers: WarrantyAnswer[]
        signaturePath: string
        ip: string
        userAgent: string | null
      },
    ): Promise<Warranty | null> {
      const { rows } = await db.query(
        `UPDATE warranties
         SET status = 'confirmed',
             answers = $2::jsonb,
             signature_path = $3,
             response_ip = $4,
             response_user_agent = $5,
             confirmed_at = now()
         WHERE token = $1 AND status = 'pending'
         RETURNING *`,
        [
          token,
          JSON.stringify(data.answers),
          data.signaturePath,
          data.ip,
          data.userAgent,
        ],
      )
      return rows[0] ? mapWarrantyRow(rows[0] as Record<string, unknown>) : null
    },
  }
}
