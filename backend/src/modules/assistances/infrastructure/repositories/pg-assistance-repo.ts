import { DB } from '../../../../shared/db/client'
import { Assistance } from '../../domain/entities'

// Accent maps para busca accent-insensitive via SQL translate() — mesmo padrão
// de pg-customer-repo.ts ("assistencia" casa "assistência", etc.).
const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuuAAAAACEEEEIIIINOOOOOUUUU'

function mapRow(r: Record<string, unknown>): Assistance {
  return {
    id:        r.id as string,
    storeId:   r.store_id as string,
    name:      r.name as string,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export function createPgAssistanceRepo(db: DB) {
  return {
    // Busca por nome (typeahead). Limite pequeno — é para preencher um dropdown.
    async findByStore(storeId: string, search?: string, limit = 10): Promise<Assistance[]> {
      const where  = search
        ? 'store_id = $1 AND translate(name, $3, $4) ILIKE translate($2, $3, $4)'
        : 'store_id = $1'
      const params = search ? [storeId, `%${search}%`, ACCENTS, PLAIN] : [storeId]
      const { rows } = await db.query(
        `SELECT * FROM assistances WHERE ${where} ORDER BY name ASC LIMIT ${limit}`,
        params,
      )
      return (rows as Record<string, unknown>[]).map(mapRow)
    },

    async findById(id: string, storeId: string): Promise<Assistance | null> {
      const { rows } = await db.query(
        `SELECT * FROM assistances WHERE id = $1 AND store_id = $2`,
        [id, storeId],
      )
      return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
    },

    // Busca exata por nome (case/acento-sensível) — usada para idempotência.
    async findByName(storeId: string, name: string): Promise<Assistance | null> {
      const { rows } = await db.query(
        `SELECT * FROM assistances WHERE store_id = $1 AND name = $2`,
        [storeId, name],
      )
      return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
    },

    async create(data: {
      storeId: string
      name: string
      createdBy: string | null
      createdByName: string | null
    }): Promise<Assistance> {
      const { rows } = await db.query(
        `INSERT INTO assistances (store_id, name, created_by, created_by_name)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [data.storeId, data.name, data.createdBy, data.createdByName],
      )
      return mapRow(rows[0] as Record<string, unknown>)
    },
  }
}
