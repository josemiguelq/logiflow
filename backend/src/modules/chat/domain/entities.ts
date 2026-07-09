// Mensagem do chat de um pedido. Append-only/imutável: cada linha registra
// quem enviou, quando e o quê — servindo de auditoria por si só.
export interface OrderMessage {
  id:          string
  orderId:     string
  storeId:     string
  delivererId: string | null
  senderType:  'store_user' | 'deliverer'
  senderId:    string
  senderName:  string
  body:        string
  createdAt:   Date
  readByStoreAt:     Date | null
  readByDelivererAt: Date | null
}

// Não-lidas do painel agrupadas por pedido (badge nos cards).
export interface UnreadCount {
  orderId: string
  count:   number
}
