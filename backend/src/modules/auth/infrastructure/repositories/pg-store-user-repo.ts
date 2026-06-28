import { DB } from '../../../../shared/db/client'
import { StoreUser } from '../../domain/entities'
import { IStoreUserRepository } from '../../application/ports'

function mapRow(row: Record<string, unknown>): StoreUser {
  return {
    id:           row.id as string,
    storeId:      row.store_id as string,
    name:         row.name as string,
    email:        row.email as string,
    passwordHash: (row.password_hash as string | null) ?? null,
    googleSub:    (row.google_sub as string | null) ?? null,
    role:         row.role as StoreUser['role'],
    active:       row.active as boolean,
    createdAt:    row.created_at as Date,
  }
}

export function createPgStoreUserRepo(db: DB): IStoreUserRepository {
  return {
    async findByEmail(email) {
      const { rows } = await db.query(
        'SELECT * FROM store_users WHERE email = $1 LIMIT 1',
        [email]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findById(id) {
      const { rows } = await db.query(
        'SELECT * FROM store_users WHERE id = $1 LIMIT 1',
        [id]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(data) {
      const { rows } = await db.query(
        `INSERT INTO store_users (store_id, name, email, password_hash, google_sub, role, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [data.storeId, data.name, data.email, data.passwordHash, data.googleSub ?? null, data.role, data.active]
      )
      return mapRow(rows[0])
    },

    async bindGoogleSub(id, googleSub) {
      await db.query('UPDATE store_users SET google_sub = $2 WHERE id = $1', [id, googleSub])
    },
  }
}
