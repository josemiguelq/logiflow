import { DB } from '../../../../shared/db/client'
import { Customer, CustomerAddress } from '../../domain/entities'

function mapAddressRow(r: Record<string, unknown>): CustomerAddress {
  return {
    id:         r.id as string,
    label:      r.label as string,
    address:    r.address as string,
    complement: r.complement as string | undefined,
    lat:        r.lat as number | undefined,
    lng:        r.lng as number | undefined,
    isDefault:  r.is_default as boolean,
  }
}

function mapRow(r: Record<string, unknown>): Customer {
  const raw = r.addresses as CustomerAddress[] | null
  return {
    id:         r.id as string,
    storeId:    r.store_id as string,
    name:       r.name as string,
    phone:      r.phone as string,
    address:    r.address as string,
    complement: r.complement as string | undefined,
    lat:        r.lat as number | undefined,
    lng:        r.lng as number | undefined,
    addresses:  raw ?? [],
    createdAt:  r.created_at as Date,
  }
}

const WITH_ADDRESSES = `
  SELECT c.*,
    COALESCE(
      json_agg(
        json_build_object(
          'id',         ca.id,
          'label',      ca.label,
          'address',    ca.address,
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
    async findByStore(storeId: string, search?: string): Promise<Customer[]> {
      const baseWhere = search
        ? 'c.store_id = $1 AND (c.name ILIKE $2 OR c.phone ILIKE $2)'
        : 'c.store_id = $1'
      const params = search ? [storeId, `%${search}%`] : [storeId]

      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE ${baseWhere}
         GROUP BY c.id
         ORDER BY c.name ASC
         LIMIT ${search ? 100 : 200}`,
        params
      )
      return rows.map(mapRow)
    },

    async findById(id: string, storeId: string): Promise<Customer | null> {
      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE c.id = $1 AND c.store_id = $2
         GROUP BY c.id`,
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByPhone(storeId: string, phone: string): Promise<Customer | null> {
      const { rows } = await db.query(
        `${WITH_ADDRESSES}
         WHERE c.store_id = $1 AND c.phone = $2
         GROUP BY c.id`,
        [storeId, phone]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(
      data: Omit<Customer, 'id' | 'createdAt' | 'addresses'>,
      addresses?: Array<{ label: string; address: string; complement?: string; lat?: number; lng?: number; isDefault?: boolean }>
    ): Promise<Customer> {
      const { rows } = await db.query(
        `INSERT INTO customers (store_id, name, phone, address, complement, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.storeId, data.name, data.phone, data.address, data.complement ?? null, data.lat ?? null, data.lng ?? null]
      )
      const customer = rows[0] as Record<string, unknown>

      const addrs = addresses?.length
        ? addresses
        : [{ label: 'Principal', address: data.address, complement: data.complement, lat: data.lat, lng: data.lng, isDefault: true }]

      const insertedAddrs: CustomerAddress[] = []
      for (let i = 0; i < addrs.length; i++) {
        const a = addrs[i]!
        const { rows: ar } = await db.query(
          `INSERT INTO customer_addresses (customer_id, store_id, label, address, complement, lat, lng, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [customer.id, data.storeId, a.label, a.address, a.complement ?? null, a.lat ?? null, a.lng ?? null, i === 0 || !!a.isDefault]
        )
        insertedAddrs.push(mapAddressRow(ar[0] as Record<string, unknown>))
      }

      return mapRow({ ...customer, addresses: insertedAddrs })
    },

    async update(id: string, storeId: string, data: Partial<Omit<Customer, 'addresses'>>): Promise<Customer | null> {
      const { rows } = await db.query(
        `UPDATE customers
         SET name       = COALESCE($3, name),
             phone      = COALESCE($4, phone),
             address    = COALESCE($5, address),
             complement = COALESCE($6, complement),
             lat        = COALESCE($7, lat),
             lng        = COALESCE($8, lng)
         WHERE id = $1 AND store_id = $2
         RETURNING id`,
        [id, storeId,
         data.name      ?? null,
         data.phone     ?? null,
         data.address   ?? null,
         data.complement ?? null,
         data.lat       ?? null,
         data.lng       ?? null]
      )
      if (!rows[0]) return null
      return this.findById(rows[0].id as string, storeId)
    },

    async addAddress(
      customerId: string, storeId: string,
      data: { label: string; address: string; complement?: string; lat?: number; lng?: number; isDefault?: boolean }
    ): Promise<CustomerAddress> {
      if (data.isDefault) {
        await db.query(
          'UPDATE customer_addresses SET is_default = false WHERE customer_id = $1',
          [customerId]
        )
      }
      const { rows } = await db.query(
        `INSERT INTO customer_addresses (customer_id, store_id, label, address, complement, lat, lng, is_default)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [customerId, storeId, data.label, data.address, data.complement ?? null, data.lat ?? null, data.lng ?? null, !!data.isDefault]
      )
      return mapAddressRow(rows[0] as Record<string, unknown>)
    },

    async updateAddress(
      addressId: string, customerId: string, storeId: string,
      data: Partial<{ label: string; address: string; complement: string; lat: number; lng: number; isDefault: boolean }>
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
             complement = COALESCE($5, complement),
             lat        = COALESCE($6, lat),
             lng        = COALESCE($7, lng),
             is_default = COALESCE($8, is_default)
         WHERE id = $1 AND customer_id = $2 AND store_id = $9
         RETURNING *`,
        [addressId, customerId, data.label, data.address, data.complement, data.lat, data.lng, data.isDefault, storeId]
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
