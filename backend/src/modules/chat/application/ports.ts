import { OrderMessage, UnreadCount } from '../domain/entities'

export interface CreateMessageInput {
  orderId:     string
  storeId:     string
  delivererId: string | null
  senderType:  'store_user' | 'deliverer'
  senderId:    string
  senderName:  string
  body:        string
}

export interface IChatRepository {
  // Contexto mínimo do pedido para autorização (existência + entregador atual).
  findOrderContext(orderId: string, storeId: string): Promise<{ delivererId: string | null } | null>

  listByOrder(orderId: string, storeId: string): Promise<OrderMessage[]>
  create(input: CreateMessageInput): Promise<OrderMessage>

  // Marca como lidas as mensagens da OUTRA ponta.
  markReadByStore(orderId: string, storeId: string): Promise<void>
  markReadByDeliverer(orderId: string): Promise<void>

  // Não-lidas do painel (mensagens do entregador), agrupadas por pedido.
  unreadByStore(storeId: string): Promise<UnreadCount[]>
}
