import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { IWhatsAppProvider } from '../../domain/ports'
import { createDbSessionStore, useDbAuthState } from './session-store'
import { DB } from '../../../../shared/db/client'

type SocketInstance = ReturnType<typeof makeWASocket>

const sockets = new Map<string, SocketInstance>()
const qrCodes = new Map<string, string>()

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
        const shouldReconnect = code !== DisconnectReason.loggedOut
        sockets.delete(storeId)
        await sessionStore.setStatus(storeId, 'DISCONNECTED')
        if (shouldReconnect) {
          setTimeout(() => createSocket(storeId), 5_000)
        }
      }
    })

    sockets.set(storeId, socket)
    return socket
  }

  return {
    async connect(storeId) {
      if (!sockets.has(storeId)) {
        await createSocket(storeId)
      }
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

    async sendMessage(phone, text) {
      let normalizedPhone = phone.replace(/\D/g, '')
      if (!normalizedPhone.startsWith('55')) normalizedPhone = `55${normalizedPhone}`
      const jid = `${normalizedPhone}@s.whatsapp.net`

      for (const [, socket] of sockets) {
        await socket.sendMessage(jid, { text })
        return
      }
      throw new Error('No active WhatsApp session')
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
