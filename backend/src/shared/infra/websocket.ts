import { WebSocket } from 'ws'

type WsClient = { storeId: string; delivererId?: string; ws: WebSocket; alive: boolean }

type RegisterInput = Omit<WsClient, 'alive'> & {
  onClose?: () => void | Promise<void>
}

const clients = new Set<WsClient>()

export function startHeartbeat() {
  setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.ws.terminate()
        clients.delete(c)
        continue
      }
      c.alive = false
      c.ws.ping()
    }
  }, 30_000)
}

export const wsHub = {
  register(input: RegisterInput) {
    const { onClose, ...rest } = input
    const client: WsClient = { ...rest, alive: true }
    clients.add(client)
    client.ws.on('pong', () => { client.alive = true })
    client.ws.on('close', () => {
      clients.delete(client)
      if (onClose) Promise.resolve(onClose()).catch(() => {})
    })
  },

  broadcastToStore(storeId: string, event: string, data: unknown) {
    const payload = JSON.stringify({ event, data })
    for (const c of clients) {
      if (c.storeId === storeId && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(payload)
      }
    }
  },

  broadcastOrderUpdate(storeId: string, order: unknown) {
    this.broadcastToStore(storeId, 'order_updated', order)
  },

  broadcastDelivererLocation(
    storeId: string,
    delivererId: string,
    lat: number,
    lng: number
  ) {
    this.broadcastToStore(storeId, 'deliverer_location', { delivererId, lat, lng })
  },

  broadcastOrderReservation(storeId: string, orderId: string, delivererId: string | null) {
    if (delivererId) {
      this.broadcastToStore(storeId, 'order_reserved', { orderId, delivererId })
    } else {
      this.broadcastToStore(storeId, 'order_unreserved', { orderId })
    }
  },
}
