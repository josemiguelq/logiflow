import { DB } from '../../../../shared/db/client'
import { Agency } from '../../domain/entities'

// Accent maps para busca accent-insensitive via SQL translate() — mesmo padrão
// de pg-assistance-repo.ts.
const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuuAAAAACEEEEIIIINOOOOOUUUU'

function mapRow(r: Record<string, unknown>): Agency {
  return {
    id:        r.id as string,
    storeId:   r.store_id as string,
    name:      r.name as string,
    address:   r.address as string,
    lat:       r.lat != null ? Number(r.lat) : null,
    lng:       r.lng != null ? Number(r.lng) : null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  }
}

export function createPgAgencyRepo(db: DB) {
  return {
    // Busca por nome (typeahead). Limite pequeno — é para preencher um dropdown.
    async findByStore(storeId: string, search?: string, limit = 10): Promise<Agency[]> {
      const where  = search
        ? 'store_id = $1 AND translate(name, $3, $4) ILIKE translate($2, $3, $4)'
        : 'store_id = $1'
      const params = search ? [storeId, `%${search}%`, ACCENTS, PLAIN] : [storeId]
      const { rows } = await db.query(
        `SELECT * FROM agencies WHERE ${where} ORDER BY name ASC LIMIT ${limit}`,
        params,
      )
      return (rows as Record<string, unknown>[]).map(mapRow)
    },

    async findById(id: string, storeId: string): Promise<Agency | null> {
      const { rows } = await db.query(
        `SELECT * FROM agencies WHERE id = $1 AND store_id = $2`,
        [id, storeId],
      )
      return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
    },

    // Busca exata por nome — usada para idempotência na criação.
    async findByName(storeId: string, name: string): Promise<Agency | null> {
      const { rows } = await db.query(
        `SELECT * FROM agencies WHERE store_id = $1 AND name = $2`,
        [storeId, name],
      )
      return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
    },

    async create(data: {
      storeId: string
      name: string
      address: string
      lat: number | null
      lng: number | null
      createdBy: string | null
      createdByName: string | null
    }): Promise<Agency> {
      const { rows } = await db.query(
        `INSERT INTO agencies (store_id, name, address, lat, lng, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.storeId, data.name, data.address, data.lat, data.lng, data.createdBy, data.createdByName],
      )
      return mapRow(rows[0] as Record<string, unknown>)
    },

    async update(
      id: string,
      storeId: string,
      data: { name?: string; address?: string; lat?: number | null; lng?: number | null },
    ): Promise<Agency | null> {
      const setLat = data.lat !== undefined
      const setLng = data.lng !== undefined
      const { rows } = await db.query(
        `UPDATE agencies
         SET name    = COALESCE($3, name),
             address = COALESCE($4, address),
             lat     = CASE WHEN $5::boolean THEN $6::double precision ELSE lat END,
             lng     = CASE WHEN $7::boolean THEN $8::double precision ELSE lng END,
             updated_at = now()
         WHERE id = $1 AND store_id = $2
         RETURNING *`,
        [id, storeId, data.name ?? null, data.address ?? null,
         setLat, data.lat ?? null, setLng, data.lng ?? null],
      )
      return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null
    },
  }
}
