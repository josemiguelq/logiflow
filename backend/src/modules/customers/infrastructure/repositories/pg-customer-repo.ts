import { DB } from '../../../../shared/db/client'
import { Customer } from '../../domain/entities'

function mapRow(r: Record<string, unknown>): Customer {
  return {
    id:         r.id as string,
    storeId:    r.store_id as string,
    name:       r.name as string,
    phone:      r.phone as string,
    address:    r.address as string,
    complement: r.complement as string | undefined,
    lat:        r.lat as number | undefined,
    lng:        r.lng as number | undefined,
    createdAt:  r.created_at as Date,
  }
}

export function createPgCustomerRepo(db: DB) {
  return {
    async findByStore(storeId: string, search?: string): Promise<Customer[]> {
      if (search) {
        const { rows } = await db.query(
          `SELECT * FROM customers
           WHERE store_id = $1
             AND (name ILIKE $2 OR phone ILIKE $2)
           ORDER BY name ASC LIMIT 100`,
          [storeId, `%${search}%`]
        )
        return rows.map(mapRow)
      }
      const { rows } = await db.query(
        'SELECT * FROM customers WHERE store_id = $1 ORDER BY name ASC LIMIT 200',
        [storeId]
      )
      return rows.map(mapRow)
    },

    async findById(id: string, storeId: string): Promise<Customer | null> {
      const { rows } = await db.query(
        'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByPhone(storeId: string, phone: string): Promise<Customer | null> {
      const { rows } = await db.query(
        'SELECT * FROM customers WHERE store_id = $1 AND phone = $2',
        [storeId, phone]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(data: Omit<Customer, 'id' | 'createdAt'>): Promise<Customer> {
      const { rows } = await db.query(
        `INSERT INTO customers (store_id, name, phone, address, complement, lat, lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.storeId, data.name, data.phone, data.address, data.complement ?? null, data.lat ?? null, data.lng ?? null]
      )
      return mapRow(rows[0])
    },

    async update(id: string, storeId: string, data: Partial<Customer>): Promise<Customer> {
      const { rows } = await db.query(
        `UPDATE customers
         SET name = COALESCE($3, name),
             address = COALESCE($4, address),
             complement = COALESCE($5, complement),
             lat = COALESCE($6, lat),
             lng = COALESCE($7, lng)
         WHERE id = $1 AND store_id = $2
         RETURNING *`,
        [id, storeId, data.name, data.address, data.complement, data.lat, data.lng]
      )
      return mapRow(rows[0])
    },
  }
}
