import { DB } from '../../../../shared/db/client'
import { IMessageLogRepository } from '../../domain/ports'

export function createPgMessageLogRepo(db: DB): IMessageLogRepository {
  return {
    async log({ storeId, orderId, phone, message }) {
      const { rows } = await db.query(
        `INSERT INTO message_logs (store_id, order_id, phone, message, status)
         VALUES ($1,$2,$3,$4,'PENDING') RETURNING id`,
        [storeId, orderId ?? null, phone, message]
      )
      return rows[0].id
    },

    async markSent(id) {
      await db.query(
        `UPDATE message_logs SET status = 'SENT', attempts = attempts + 1 WHERE id = $1`,
        [id]
      )
    },

    async markFailed(id) {
      await db.query(
        `UPDATE message_logs SET status = 'FAILED', attempts = attempts + 1 WHERE id = $1`,
        [id]
      )
    },
  }
}
