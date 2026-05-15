import bcrypt from 'bcryptjs'
import { DB } from '../../../../shared/db/client'
import { Deliverer, DelivererStatus } from '../../domain/entities'

function mapRow(r: Record<string, unknown>): Deliverer {
  return {
    id:              r.id as string,
    storeId:         r.store_id as string,
    name:            r.name as string,
    email:           r.email as string | undefined,
    username:        r.username as string,
    passwordHash:    r.password_hash as string,
    profileImageUrl: r.profile_image_url as string | undefined,
    status:          r.status as DelivererStatus,
    isActive:        r.is_active as boolean,
    needsOnboarding: r.needs_onboarding as boolean,
    createdAt:       r.created_at as Date,
  }
}

export function createPgDelivererRepo(db: DB) {
  return {
    async findByStore(storeId: string): Promise<Omit<Deliverer, 'passwordHash'>[]> {
      const { rows } = await db.query(
        `SELECT id, store_id, name, email, username, profile_image_url, status, is_active, needs_onboarding, created_at
         FROM deliverers WHERE store_id = $1 ORDER BY is_active DESC, name ASC`,
        [storeId]
      )
      return rows.map((r: Record<string, unknown>) => { const { passwordHash: _, ...rest } = mapRow(r); return rest })
    },

    async findById(id: string, storeId: string): Promise<Deliverer | null> {
      const { rows } = await db.query(
        'SELECT * FROM deliverers WHERE id = $1 AND store_id = $2',
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(data: {
      storeId: string
      name: string
      email?: string
      username: string
      password: string
    }): Promise<Omit<Deliverer, 'passwordHash'>> {
      const passwordHash = await bcrypt.hash(data.password, 10)
      const { rows } = await db.query(
        `INSERT INTO deliverers (store_id, name, email, username, password_hash)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [data.storeId, data.name, data.email ?? null, data.username, passwordHash]
      )
      const { passwordHash: _, ...rest } = mapRow(rows[0])
      return rest
    },

    async update(
      id: string,
      storeId: string,
      data: { name?: string; email?: string | null; username?: string; password?: string }
    ): Promise<Omit<Deliverer, 'passwordHash'> | null> {
      const sets: string[] = []
      const values: unknown[] = []
      let i = 1

      if (data.name !== undefined)     { sets.push(`name = $${i++}`);          values.push(data.name) }
      if (data.email !== undefined)    { sets.push(`email = $${i++}`);         values.push(data.email) }
      if (data.username !== undefined) { sets.push(`username = $${i++}`);      values.push(data.username) }
      if (data.password)               { sets.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(data.password, 10)) }

      if (sets.length === 0) return null

      values.push(id, storeId)
      const { rows } = await db.query(
        `UPDATE deliverers SET ${sets.join(', ')}
         WHERE id = $${i++} AND store_id = $${i++} RETURNING *`,
        values
      )
      if (!rows[0]) return null; const { passwordHash: _, ...rest } = mapRow(rows[0]); return rest
    },

    async setActive(id: string, storeId: string, active: boolean): Promise<void> {
      await db.query(
        'UPDATE deliverers SET is_active = $1 WHERE id = $2 AND store_id = $3',
        [active, id, storeId]
      )
    },

    async updateStatus(id: string, storeId: string, status: DelivererStatus): Promise<void> {
      await db.query(
        'UPDATE deliverers SET status = $1 WHERE id = $2 AND store_id = $3',
        [status, id, storeId]
      )
    },

    async suggestForOrder(storeId: string) {
      const { rows } = await db.query(
        `SELECT d.id, d.name, d.status,
                COUNT(o.id) AS active_orders
         FROM deliverers d
         LEFT JOIN orders o ON o.deliverer_id = d.id
           AND o.status NOT IN ('DELIVERED','CANCELLED')
         WHERE d.store_id = $1 AND d.status != 'OFFLINE' AND d.is_active = true
         GROUP BY d.id
         ORDER BY active_orders ASC, d.name ASC
         LIMIT 5`,
        [storeId]
      )
      return rows
    },
  }
}
