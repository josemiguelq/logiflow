// Domain port — the domain knows NOTHING about Baileys.

export interface IWhatsAppProvider {
  sendMessage(phone: string, text: string): Promise<void>
  getQRCode(storeId: string): Promise<string | null>
  connect(storeId: string): Promise<void>
  disconnect(storeId: string): Promise<void>
  getStatus(storeId: string): Promise<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>
  reconnectAll(): Promise<void>
}

export interface IMessageLogRepository {
  log(entry: {
    storeId: string
    orderId?: string
    phone: string
    message: string
  }): Promise<string>
  markSent(id: string): Promise<void>
  markFailed(id: string): Promise<void>
}
