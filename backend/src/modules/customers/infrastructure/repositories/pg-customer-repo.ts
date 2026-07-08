import { DB } from '../../../../shared/db/client'
import { Customer, CustomerAddress, CustomerAuditEntry } from '../../domain/entities'

// Accent maps for accent-insensitive name search via SQL translate().
// "jose" matches "josé", "JOSÉ", etc. (covers PT-BR accents, both cases).
const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuuAAAAACEEEEIIIINOOOOOUUUU'

function mapAddressRow(r: Record<string, unknown>): CustomerAddress {
  return {
    id:         r.id as string,
    label:      r.label as string,
    address:    r.address as string,
    number:     r.number as string | undefined,
    complement: r.complement as string | undefined,
    lat:        r.lat as number | undefined,
    lng:        r.lng as number | undefined,
    isDefault:  r.is_default as boolean,
  }
}

function mapRow(r: Record<string, unknown>): Customer {
  const raw = r.addresses as CustomerAddress[] | null
  return {
    id:             r.id as string,
    storeId:        r.store_id as string,
    name:           r.name as string,
    phone:          r.phone as string,
    assistanceId:   (r.assistance_id as string | null) ?? null,
    assistanceName: (r.assistance_name as string | null) ?? null,
    addresses:      raw ?? [],
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
    audit:     (r.audit as CustomerAuditEntry[] | null) ?? [],
    warrantyAccepted: (r.warranty_accepted as boolean | null) ?? false,
  }
}

const WITH_ADDRESSES = `
  SELECT c.*,
    (SELECT a.name FROM assistances a WHERE a.id = c.assistance_id) AS assistance_name,
    EXISTS (
      SELECT 1 FROM warranty_acceptances wa
      JOIN warranty_terms_versions v ON v.id = wa.terms_version_id AND v.is_current
      WHERE wa.customer_id = c.id AND wa.store_id = c.store_id AND wa.status = 'confirmed'
    ) AS warranty_accepted,
    COALESCE(
      json_agg(
        json_build_object(
          'id',         ca.id,
          'label',      ca.label,
          'address',    ca.address,
          'number',     ca.number,
          'complement', ca.complement,
          'lat',        ca.lat,
          'lng',        ca.lng,
          'isDefault',  ca.is_default
        ) ORDER BY ca.is_default DESC, ca.created_at ASC
      ) FILTER (WHERE ca.id IS NOT NULL),
      '[]'::json
    ) AS addresses
  FROM customers c
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id
`

export function createPgCustomerRepo(db: DB) {
  return {
    async findByStore(
      storeId: string,
      search?: string,
      page = 1,
      limit = 15,
      sort: 'newest' | 'oldest' = 'newest',
    ): Promise<{ items: Customer[]; total: number }> {
      const baseWhere = search
        ? 'c.store_id = $1 AND c.deleted_at IS NULL AND (translate(c.name, $3, $4) ILIKE translate($2, $3, $4) OR c.phone ILIKE $2)'
        : 'c.store_id = $1 AND c.deleted_at IS NULL'
      // Ordena o dataset inteiro no banco (não só a página atual) por data de criação.
      const dir     = sort === 'oldest' ? 'ASC' : 'DESC'
      const offset  = (page - 1) * limit
      const params  = search ? [storeId, `%${search}%`, ACCENTS, PLAIN] : [storeId]

      const { rows } = await db.query(
        `SELECT sub.*, COUNT(*) OVER() AS total_count
         FROM (
           ${WITH_ADDRESSES}
           WHERE ${baseWhere}
           GROUP BY c.id
           ORDER BY c.created_at ${dir}
         ) sub
         LIMIT ${limit} OFFSET ${offset}`,
        params
      )
      const total = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count) : 0
      return { items: rows.map(mapRow), total }
    },

    async findAllByStore(
      storeId: string,
      sort: 'newest' | 'oldest' = 'newest',
    ): Promise<{ items: Customer[]; total: number }> {
      const dir = sort === 'oldest' ? 'ASC' : 'DESC'
      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE c.store_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id
         ORDER BY c.created_at ${dir}`,
        [storeId]
      )
      const items = rows.map(mapRow)
      return { items, total: items.length }
    },

    async findById(id: string, storeId: string): Promise<Customer | null> {
      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE c.id = $1 AND c.store_id = $2 AND c.deleted_at IS NULL
         GROUP BY c.id`,
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByPhone(storeId: string, phone: string): Promise<Customer | null> {
      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE c.store_id = $1 AND c.phone = $2 AND c.deleted_at IS NULL
         GROUP BY c.id`,
        [storeId, phone]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(
      data: { storeId: string; name: string; phone: string; assistanceId?: string | null },
      addresses: Array<{ label: string; address: string; number?: string; complement?: string; lat?: number; lng?: number; isDefault?: boolean }>
    ): Promise<Customer> {
      const { rows } = await db.query(
        `INSERT INTO customers (store_id, name, phone, assistance_id) VALUES ($1,$2,$3,$4) RETURNING *`,
        [data.storeId, data.name, data.phone, data.assistanceId ?? null]
      )
      const customer = rows[0] as Record<string, unknown>

      const insertedAddrs: CustomerAddress[] = []
      for (let i = 0; i < addresses.length; i++) {
        const a = addresses[i]!
        const { rows: ar } = await db.query(
          `INSERT INTO customer_addresses (customer_id, store_id, label, address, number, complement, lat, lng, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [customer.id, data.storeId, a.label, a.address, a.number ?? null, a.complement ?? null, a.lat ?? null, a.lng ?? null, i === 0 || !!a.isDefault]
        )
        insertedAddrs.push(mapAddressRow(ar[0] as Record<string, unknown>))
      }

      return mapRow({ ...customer, addresses: insertedAddrs })
    },

    async update(
      id: string,
      storeId: string,
      data: { name?: string; phone?: string; assistanceId?: string | null },
      auditEntry?: CustomerAuditEntry,
    ): Promise<Customer | null> {
      // assistance_id é nullable e pode ser definido como NULL (desvincular), então
      // COALESCE não serve: usamos um flag explícito ($6) para "alterar ou não".
      const setAssistance = data.assistanceId !== undefined
      // Sempre bump em updated_at; anexa a entrada de auditoria (se houver) ao array.
      const { rows } = await db.query(
        `UPDATE customers
         SET name          = COALESCE($3, name),
             phone         = COALESCE($4, phone),
             assistance_id = CASE WHEN $6::boolean THEN $7::uuid ELSE assistance_id END,
             updated_at    = now(),
             audit         = CASE WHEN $5::jsonb IS NOT NULL THEN audit || $5::jsonb ELSE audit END
         WHERE id = $1 AND store_id = $2
         RETURNING id`,
        [id, storeId, data.name ?? null, data.phone ?? null,
         auditEntry ? JSON.stringify([auditEntry]) : null,
         setAssistance, data.assistanceId ?? null]
      )
      if (!rows[0]) return null
      return this.findById(rows[0].id as string, storeId)
    },

    async addAddress(
      customerId: string, storeId: string,
      data: { label: string; address: string; number?: string; complement?: string; lat?: number; lng?: number; isDefault?: boolean }
    ): Promise<CustomerAddress> {
      if (data.isDefault) {
        await db.query(
          'UPDATE customer_addresses SET is_default = false WHERE customer_id = $1',
          [customerId]
        )
      }
      const { rows } = await db.query(
        `INSERT INTO customer_addresses (customer_id, store_id, label, address, number, complement, lat, lng, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [customerId, storeId, data.label, data.address, data.number ?? null, data.complement ?? null, data.lat ?? null, data.lng ?? null, !!data.isDefault]
      )
      return mapAddressRow(rows[0] as Record<string, unknown>)
    },

    async updateAddress(
      addressId: string, customerId: string, storeId: string,
      data: Partial<{ label: string; address: string; number: string; complement: string; lat: number; lng: number; isDefault: boolean }>
    ): Promise<CustomerAddress | null> {
      if (data.isDefault) {
        await db.query(
          'UPDATE customer_addresses SET is_default = false WHERE customer_id = $1',
          [customerId]
        )
      }
      const { rows } = await db.query(
        `UPDATE customer_addresses
         SET label      = COALESCE($3, label),
             address    = COALESCE($4, address),
             number     = COALESCE($5, number),
             complement = COALESCE($6, complement),
             lat        = COALESCE($7, lat),
             lng        = COALESCE($8, lng),
             is_default = COALESCE($9, is_default)
         WHERE id = $1 AND customer_id = $2 AND store_id = $10
         RETURNING *`,
        [addressId, customerId, data.label, data.address, data.number, data.complement, data.lat, data.lng, data.isDefault, storeId]
      )
      return rows[0] ? mapAddressRow(rows[0] as Record<string, unknown>) : null
    },

    async removeAddress(addressId: string, customerId: string, storeId: string): Promise<boolean> {
      const { rowCount } = await db.query(
        'DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 AND store_id = $3',
        [addressId, customerId, storeId]
      )
      return (rowCount ?? 0) > 0
    },
  }
}
