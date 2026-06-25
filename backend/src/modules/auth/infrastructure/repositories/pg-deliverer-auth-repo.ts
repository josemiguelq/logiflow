import { DB } from '../../../../shared/db/client'
import { Deliverer } from '../../domain/entities'
import { IDelivererAuthRepository } from '../../application/ports'

function mapRow(row: Record<string, unknown>): Deliverer {
  return {
    id:              row.id as string,
    storeId:         row.store_id as string,
    name:            row.name as string,
    email:           row.email as string | undefined,
    username:        row.username as string,
    passwordHash:    row.password_hash as string,
    profileImageUrl: row.profile_image_url as string | undefined,
    status:          row.status as Deliverer['status'],
    isActive:        row.is_active as boolean,
    needsOnboarding: row.needs_onboarding as boolean,
    needsSwitchTour: row.needs_switch_tour as boolean,
    termsAcceptedVersion: (row.terms_accepted_version as string | null) ?? null,
    createdAt:       row.created_at as Date,
  }
}

export function createPgDelivererAuthRepo(db: DB): IDelivererAuthRepository {
  return {
    async findByUsername(username) {
      const { rows } = await db.query(
        'SELECT * FROM deliverers WHERE username = $1 AND is_active = true LIMIT 1',
        [username]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByStoreAndUsername(storeId, username) {
      const { rows } = await db.query(
        'SELECT * FROM deliverers WHERE store_id = $1 AND username = $2 AND is_active = true LIMIT 1',
        [storeId, username]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findById(id) {
      const { rows } = await db.query(
        'SELECT * FROM deliverers WHERE id = $1 LIMIT 1',
        [id]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },
  }
}
