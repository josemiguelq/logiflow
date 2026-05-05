import { WebSocket } from 'ws'

type WsClient = { storeId: string; delivererId?: string; ws: WebSocket }

const clients = new Set<WsClient>()

export const wsHub = {
  register(client: WsClient) {
    clients.add(client)
    client.ws.on('close', () => clients.delete(client))
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
}
