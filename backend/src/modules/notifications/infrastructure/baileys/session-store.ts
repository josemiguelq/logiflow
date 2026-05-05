import { DB } from '../../../../shared/db/client'

export function createDbSessionStore(db: DB) {
  return {
    async get(storeId: string): Promise<Record<string, unknown> | null> {
      const { rows } = await db.query(
        'SELECT session_data FROM whatsapp_sessions WHERE store_id = $1',
        [storeId]
      )
      return rows[0]?.session_data ?? null
    },

    async set(storeId: string, data: Record<string, unknown>): Promise<void> {
      await db.query(
        `INSERT INTO whatsapp_sessions (store_id, session_data, status, updated_at)
         VALUES ($1, $2, 'CONNECTED', now())
         ON CONFLICT (store_id) DO UPDATE
         SET session_data = $2, updated_at = now()`,
        [storeId, JSON.stringify(data)]
      )
    },

    async setStatus(storeId: string, status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'): Promise<void> {
      await db.query(
        `INSERT INTO whatsapp_sessions (store_id, status, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (store_id) DO UPDATE
         SET status = $2, updated_at = now()`,
        [storeId, status]
      )
    },

    async getStatus(storeId: string): Promise<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'> {
      const { rows } = await db.query(
        'SELECT status FROM whatsapp_sessions WHERE store_id = $1',
        [storeId]
      )
      return (rows[0]?.status ?? 'DISCONNECTED') as 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'
    },
  }
}
