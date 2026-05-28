import type { DB } from '../../../../shared/db/client'
import type { IDeviceTokenRepository } from '../../domain/push-ports'

export function createPgDeviceTokenRepo(db: DB): IDeviceTokenRepository {
  return {
    async upsert(delivererId, token, platform) {
      await db.query(
        `INSERT INTO device_tokens (deliverer_id, token, platform)
         VALUES ($1, $2, $3)
         ON CONFLICT (deliverer_id, token) DO NOTHING`,
        [delivererId, token, platform],
      )
    },

    async findByDeliverer(delivererId) {
      const { rows } = await db.query<{ token: string }>(
        'SELECT token FROM device_tokens WHERE deliverer_id = $1',
        [delivererId],
      )
      return rows.map((r) => r.token)
    },

    async findByStore(storeId) {
      const { rows } = await db.query<{ token: string }>(
        `SELECT dt.token
         FROM device_tokens dt
         JOIN deliverers d ON d.id = dt.deliverer_id
         WHERE d.store_id = $1 AND d.is_active = true`,
        [storeId],
      )
      return rows.map((r) => r.token)
    },

    async delete(token) {
      await db.query('DELETE FROM device_tokens WHERE token = $1', [token])
    },
  }
}
