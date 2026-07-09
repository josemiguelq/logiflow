// Domain port — the domain knows NOTHING about Baileys.

export interface IWhatsAppProvider {
  // Retorna o id da mensagem no WhatsApp (key.id), ou null se indisponível.
  sendMessage(storeId: string, phone: string, text: string): Promise<string | null>
  getQRCode(storeId: string): Promise<string | null>
  connect(storeId: string): Promise<void>
  disconnect(storeId: string): Promise<void>
  getStatus(storeId: string): Promise<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>
  reconnectAll(): Promise<void>
}

export interface MessageLogEntry {
  id: string
  message: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  createdAt: Date
}

export interface IMessageLogRepository {
  log(entry: {
    storeId: string
    orderId?: string
    phone: string
    message: string
  }): Promise<string>
  markSent(id: string, waMessageId?: string | null): Promise<void>
  markFailed(id: string, error?: string): Promise<void>
  findByOrder(storeId: string, orderId: string): Promise<MessageLogEntry[]>
}
