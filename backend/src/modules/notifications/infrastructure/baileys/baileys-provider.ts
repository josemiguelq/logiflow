import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessageContent,
  type WAMessageKey,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { IWhatsAppProvider } from '../../domain/ports'
import { createDbSessionStore, useDbAuthState } from './session-store'
import { DB } from '../../../../shared/db/client'

type SocketInstance = ReturnType<typeof makeWASocket>

const sockets = new Map<string, SocketInstance>()
const qrCodes = new Map<string, string>()

// Cache das mensagens enviadas, por id. Quando o aparelho do destinatário não
// consegue descriptografar, ele pede o reenvio (retry receipt) e o Baileys chama
// getMessage(key) para reencriptar e reenviar. Sem isso, a mensagem fica em
// "Aguardando mensagem. Esta ação pode levar alguns instantes" para sempre.
const MAX_CACHED_MESSAGES = 1_000
const sentMessages = new Map<string, WAMessageContent>()

function cacheSentMessage(id: string, content: WAMessageContent) {
  sentMessages.set(id, content)
  if (sentMessages.size > MAX_CACHED_MESSAGES) {
    const oldest = sentMessages.keys().next().value
    if (oldest !== undefined) sentMessages.delete(oldest)
  }
}

export function createBaileysProvider(db: DB): IWhatsAppProvider {
  const sessionStore = createDbSessionStore(db)

  async function createSocket(storeId: string): Promise<SocketInstance> {
    const { state, saveCreds } = await useDbAuthState(db, storeId)
    const { version }          = await fetchLatestBaileysVersion()

    const socket = makeWASocket({
      version,
      auth:              state,
      printQRInTerminal: false,
      browser:           ['LogiFlow', 'Chrome', '1.0'],
      // Render cold-starts are slow — give WhatsApp more time to respond
      connectTimeoutMs:      60_000,
      defaultQueryTimeoutMs: 0,       // 0 = no timeout (wait indefinitely)
      // Responde a retry receipts: devolve a mensagem original para o Baileys
      // reencriptar e reenviar quando o destinatário não conseguiu descriptografar.
      // Cache em memória (exato) primeiro; fallback no message_logs (sobrevive a
      // restart) reconstruindo o texto salvo.
      getMessage: async (key: WAMessageKey): Promise<WAMessageContent | undefined> => {
        if (!key.id) return undefined
        const cached = sentMessages.get(key.id)
        if (cached) return cached
        try {
          const { rows } = await db.query(
            `SELECT message FROM message_logs WHERE wa_message_id = $1 LIMIT 1`,
            [key.id]
          )
          const text = rows[0]?.message as string | undefined
          return text ? { conversation: text } : undefined
        } catch {
          return undefined
        }
      },
      // Suppress Baileys' verbose internal error logs
      logger: {
        level: 'silent',
        trace: () => {}, debug: () => {}, info: () => {},
        warn:  () => {}, error: () => {}, fatal: () => {},
        child: () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({} as never) }),
      } as never,
    })

    socket.ev.on('creds.update', saveCreds)

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        qrCodes.set(storeId, qr)
        await sessionStore.setStatus(storeId, 'CONNECTING')
      }

      if (connection === 'open') {
        qrCodes.delete(storeId)
        await sessionStore.setStatus(storeId, 'CONNECTED')
      }

      if (connection === 'close') {
        const code = (lastDisconnect?.error as Boom)?.output?.statusCode
        sockets.delete(storeId)
        qrCodes.delete(storeId)
        await sessionStore.setStatus(storeId, 'DISCONNECTED')
        if (code !== DisconnectReason.loggedOut) {
          // Transient error — auto-retry with existing credentials
          setTimeout(() => createSocket(storeId), 5_000)
        }
        // loggedOut: credentials are dead. Wait for explicit connect() call.
      }
    })

    sockets.set(storeId, socket)
    return socket
  }

  async function clearCredentials(storeId: string) {
    await db.query(
      `UPDATE whatsapp_sessions SET session_data = NULL WHERE store_id = $1`,
      [storeId]
    )
    await db.query(`DELETE FROM whatsapp_keys WHERE store_id = $1`, [storeId])
  }

  return {
    async connect(storeId) {
      // Close any lingering socket before starting fresh
      const existing = sockets.get(storeId)
      if (existing) {
        try { existing.end(undefined) } catch { /* best-effort */ }
        sockets.delete(storeId)
        qrCodes.delete(storeId)
      }
      // Wipe stale credentials — forces Baileys to generate a new QR
      await clearCredentials(storeId)
      await createSocket(storeId)
    },

    async disconnect(storeId) {
      const socket = sockets.get(storeId)
      if (socket) {
        await socket.logout()
        sockets.delete(storeId)
      }
      await sessionStore.setStatus(storeId, 'DISCONNECTED')
    },

    async getQRCode(storeId) {
      return qrCodes.get(storeId) ?? null
    },

    async getStatus(storeId) {
      return sessionStore.getStatus(storeId)
    },

    async sendMessage(storeId, phone, text) {
      const socket = sockets.get(storeId)
      if (!socket) throw new Error(`No active WhatsApp session for store ${storeId}`)

      let normalizedPhone = phone.replace(/\D/g, '')
      if (!normalizedPhone.startsWith('55')) normalizedPhone = `55${normalizedPhone}`

      // Resolve o JID canônico no WhatsApp. Números brasileiros são muitas vezes
      // registrados SEM o 9º dígito extra (ex.: 5567 9 91910048 → 556791910048).
      // Enviar direto para o JID "cru" resolve sem erro mas nunca entrega — o
      // onWhatsApp devolve o jid real registrado (e se o número existe).
      const results = await socket.onWhatsApp(normalizedPhone)
      const match   = results?.[0]
      if (!match?.exists || !match.jid) {
        throw new Error(`Phone ${normalizedPhone} is not a registered WhatsApp number`)
      }
      const sent = await socket.sendMessage(match.jid, { text })
      const waId = sent?.key?.id ?? null
      // Guarda para conseguir reenviar caso o destinatário peça (retry receipt).
      if (waId && sent?.message) cacheSentMessage(waId, sent.message)
      return waId
    },

    async reconnectAll() {
      const storeIds = await sessionStore.getConnectedStoreIds()
      for (const storeId of storeIds) {
        if (!sockets.has(storeId)) {
          createSocket(storeId).catch(() => { /* will retry on its own */ })
        }
      }
    },
  }
}
