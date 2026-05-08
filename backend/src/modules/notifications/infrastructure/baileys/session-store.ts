import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type SignalKeyStore,
} from '@whiskeysockets/baileys'
import { DB } from '../../../../shared/db/client'

export function createDbSessionStore(db: DB) {
  return {
    async setStatus(storeId: string, status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'): Promise<void> {
      await db.query(
        `INSERT INTO whatsapp_sessions (store_id, status, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (store_id) DO UPDATE SET status = $2, updated_at = now()`,
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

    async getConnectedStoreIds(): Promise<string[]> {
      const { rows } = await db.query(
        `SELECT store_id FROM whatsapp_sessions WHERE status = 'CONNECTED'`
      )
      return rows.map((r: Record<string, unknown>) => r.store_id as string)
    },
  }
}

export async function useDbAuthState(db: DB, storeId: string): Promise<{
  state: { creds: AuthenticationCreds; keys: SignalKeyStore }
  saveCreds: () => Promise<void>
}> {
  const { rows: [row] } = await db.query(
    'SELECT session_data FROM whatsapp_sessions WHERE store_id = $1',
    [storeId]
  )

  const creds: AuthenticationCreds = row?.session_data
    ? JSON.parse(JSON.stringify(row.session_data), BufferJSON.reviver)
    : initAuthCreds()

  const keys: SignalKeyStore = {
    async get(type, ids) {
      if (ids.length === 0) return {}
      const { rows } = await db.query(
        'SELECT key_id, key_data FROM whatsapp_keys WHERE store_id = $1 AND key_type = $2 AND key_id = ANY($3)',
        [storeId, type, ids]
      )
      const result: Record<string, unknown> = {}
      for (const r of rows as Array<{ key_id: string; key_data: unknown }>) {
        let val = JSON.parse(JSON.stringify(r.key_data), BufferJSON.reviver)
        if (type === 'app-state-sync-key') {
          val = proto.Message.AppStateSyncKeyData.fromObject(val)
        }
        result[r.key_id] = val
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result as any
    },

    async set(data) {
      for (const [type, typeData] of Object.entries(data)) {
        if (!typeData) continue
        for (const [id, value] of Object.entries(typeData)) {
          if (value != null) {
            await db.query(
              `INSERT INTO whatsapp_keys (store_id, key_type, key_id, key_data)
               VALUES ($1, $2, $3, $4::jsonb)
               ON CONFLICT (store_id, key_type, key_id) DO UPDATE SET key_data = EXCLUDED.key_data`,
              [storeId, type, id, JSON.stringify(value, BufferJSON.replacer)]
            )
          } else {
            await db.query(
              'DELETE FROM whatsapp_keys WHERE store_id = $1 AND key_type = $2 AND key_id = $3',
              [storeId, type, id]
            )
          }
        }
      }
    },

    async clear() {
      await db.query('DELETE FROM whatsapp_keys WHERE store_id = $1', [storeId])
    },
  }

  const saveCreds = async () => {
    await db.query(
      `INSERT INTO whatsapp_sessions (store_id, session_data, status, updated_at)
       VALUES ($1, $2::jsonb, 'CONNECTED', now())
       ON CONFLICT (store_id) DO UPDATE SET session_data = $2::jsonb, updated_at = now()`,
      [storeId, JSON.stringify(creds, BufferJSON.replacer)]
    )
  }

  return { state: { creds, keys }, saveCreds }
}
