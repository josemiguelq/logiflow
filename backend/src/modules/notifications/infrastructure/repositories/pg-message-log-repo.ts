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

    async markSent(id, waMessageId) {
      await db.query(
        `UPDATE message_logs
         SET status = 'SENT', attempts = attempts + 1,
             wa_message_id = COALESCE($2, wa_message_id)
         WHERE id = $1`,
        [id, waMessageId ?? null]
      )
    },

    async markFailed(id) {
      await db.query(
        `UPDATE message_logs SET status = 'FAILED', attempts = attempts + 1 WHERE id = $1`,
        [id]
      )
    },

    async findByOrder(storeId, orderId) {
      const { rows } = await db.query(
        `SELECT id, message, status, created_at
         FROM message_logs
         WHERE store_id = $1 AND order_id = $2
         ORDER BY created_at ASC`,
        [storeId, orderId]
      )
      return (rows as Record<string, unknown>[]).map((r) => ({
        id:        r.id as string,
        message:   r.message as string,
        status:    r.status as 'PENDING' | 'SENT' | 'FAILED',
        createdAt: r.created_at as Date,
      }))
    },
  }
}
