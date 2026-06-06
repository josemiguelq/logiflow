import { Order, OrderWithDetails, OrderStatus } from '../domain/entities'

export interface IOrderRepository {
  findById(id: string, storeId: string): Promise<OrderWithDetails | null>
  findByStore(storeId: string, filters: OrderFilters): Promise<OrderWithDetails[]>
  searchByStore(storeId: string, filters: OrderFilters): Promise<{ items: OrderWithDetails[]; total: number }>
  findByDeliverer(delivererId: string): Promise<OrderWithDetails[]>
  findByRoute(routeId: string): Promise<OrderWithDetails[]>
  findPreparing(storeId: string, requestingDelivererId?: string): Promise<OrderWithDetails[]>
  create(data: Omit<Order, 'id' | 'createdAt'>): Promise<Order>
  updateStatus(id: string, status: OrderStatus, extra?: Partial<Order>): Promise<Order>
  assignDeliverer(id: string, delivererId: string, routePosition: number): Promise<Order>
  addProof(orderId: string, photoUrl: string, lat?: number, lng?: number, photoIndex?: number): Promise<void>
  submitRating(orderId: string, rating: number, comment?: string): Promise<void>
  getPublic(id: string): Promise<PublicOrderView | null>
  findInTransit(): Promise<InTransitOrder[]>
  // Menor route_position ainda pendente (não entregue/cancelada) de uma rota.
  getMinPendingRoutePosition(routeId: string): Promise<number | null>
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
  customer: { name: string; address: string }
  deliverer?: { name: string; lat?: number; lng?: number }
  routePosition?: number
  isCurrentStop: boolean
  rating?:        number
  ratingComment?: string
  ratingEnabled:  boolean
}
