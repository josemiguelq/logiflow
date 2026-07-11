// Domain port — the domain knows NOTHING sobre o provedor (Baileys, Cloud API…).

// Um parâmetro de template. `body` = variáveis {{n}} do corpo; `buttonUrl` = sufixo
// dinâmico do botão de URL (numeração própria no template).
export interface TemplateParams {
  body: string[]
  buttonUrlSuffix?: string
}

export interface IWhatsAppProvider {
  // Envio por template aprovado (business-initiated). Retorna o id da mensagem no
  // WhatsApp, ou null se indisponível. É o caminho usado nas notificações de status.
  sendTemplate(
    storeId: string,
    phone: string,
    templateName: string,
    langCode: string,
    params: TemplateParams,
  ): Promise<string | null>
  // Texto livre — só permitido dentro da janela de 24h. Retorna o id da mensagem.
  sendMessage(storeId: string, phone: string, text: string): Promise<string | null>
  getQRCode(storeId: string): Promise<string | null>
  connect(storeId: string): Promise<void>
  disconnect(storeId: string): Promise<void>
  getStatus(storeId: string): Promise<'DISCONNECTED' | 'CONNECTING' | 'CONNECTED'>
  reconnectAll(): Promise<void>
}

export type MessageStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'

export interface MessageLogEntry {
  id: string
  message: string
  status: MessageStatus
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
  // Atualiza o status a partir de um webhook do WhatsApp, casando pelo wa_message_id.
  markStatus(waMessageId: string, status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED', error?: string): Promise<void>
  findByOrder(storeId: string, orderId: string): Promise<MessageLogEntry[]>
}
