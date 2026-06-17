import { Order, OrderWithDetails, OrderStatus, OrderLogEntry, OrderSummary } from '../domain/entities'

export interface IOrderRepository {
  findById(id: string, storeId: string): Promise<OrderWithDetails | null>
  findByStore(storeId: string, filters: OrderFilters): Promise<OrderWithDetails[]>
  searchByStore(storeId: string, filters: OrderFilters): Promise<{ items: OrderWithDetails[]; total: number }>
  findByDeliverer(delivererId: string): Promise<OrderWithDetails[]>
  findByRoute(routeId: string): Promise<OrderWithDetails[]>
  // Próxima parada de uma rota: pedido ON_ROUTE de menor route_position.
  findNextOnRoute(routeId: string): Promise<OrderWithDetails | null>
  findPreparing(storeId: string, requestingDelivererId?: string): Promise<OrderWithDetails[]>
  create(data: Omit<Order, 'id' | 'createdAt'>): Promise<Order>
  updateStatus(id: string, status: OrderStatus, extra?: Partial<Order>): Promise<Order>
  // Transição idempotente ON_ROUTE → OUT_FOR_DELIVERY. Retorna o pedido só quando
  // ESTE chamada efetuou a mudança (status era ON_ROUTE); null se já avançado.
  // Permite que múltiplos gatilhos (start de rota, start por pedido) notifiquem 1x só.
  transitionToOutForDelivery(id: string): Promise<Order | null>
  assignDeliverer(id: string, delivererId: string, routePosition: number): Promise<Order>
  addProof(orderId: string, photoUrl: string, lat?: number, lng?: number, photoIndex?: number): Promise<void>
  submitRating(orderId: string, rating: number, comment?: string): Promise<void>
  getPublic(id: string): Promise<PublicOrderView | null>
  findInTransit(): Promise<InTransitOrder[]>
  // Auditoria: anexa uma entrada ao log JSONB do pedido.
  appendLog(orderId: string, entry: OrderLogEntry): Promise<void>
  // Grava o resumo de tempos do pedido (na entrega).
  setSummary(orderId: string, summary: OrderSummary): Promise<void>
  // Contagem de pedidos atrasados (limiar vermelho) por fase + limiar de retirada.
  findDelayedSummary(storeId: string): Promise<DelayedSummary>
  // Menor route_position ainda pendente (não entregue/cancelada) de uma rota.
  getMinPendingRoutePosition(routeId: string): Promise<number | null>
}

export interface DelayedSummary {
  pickupDelayed:   number  // PREPARING ainda não retirados, atrasados (vermelho)
  deliveryDelayed: number  // em rota, atrasados (vermelho)
  prepRedMin:      number  // limiar de retirada da loja (minutos)
}

export interface InTransitOrder {
  id:            string
  storeId:       string
  delivererId?:  string
  customerName:  string
  delivererName?: string
  minutes:       number       // minutos desde picked_up_at
  transitYellowMin: number    // limiares da loja (resolvidos com default)
  transitRedMin:    number
}

export interface OrderFilters {
  status?: OrderStatus
  delivererId?: string
  createdByUserId?: string
  customerName?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

export interface PublicOrderView {
  id: string
  status: string
  deliveryCode: string
  customer: { name: string; address: string; lat?: number; lng?: number }
  deliverer?: { name: string; lat?: number; lng?: number }
  routePosition?: number
  isCurrentStop: boolean
  rating?:        number
  ratingComment?: string
  ratingEnabled:  boolean
}
