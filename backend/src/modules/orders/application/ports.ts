import { Order, OrderWithDetails, OrderStatus } from '../domain/entities'

export interface IOrderRepository {
  findById(id: string, storeId: string): Promise<OrderWithDetails | null>
  findByStore(storeId: string, filters: OrderFilters): Promise<OrderWithDetails[]>
  findByDeliverer(delivererId: string): Promise<OrderWithDetails[]>
  create(data: Omit<Order, 'id' | 'createdAt'>): Promise<Order>
  updateStatus(id: string, status: OrderStatus, extra?: Partial<Order>): Promise<Order>
  assignDeliverer(id: string, delivererId: string, routePosition: number): Promise<Order>
  addProof(orderId: string, photoUrl: string, lat?: number, lng?: number): Promise<void>
  getPublic(id: string): Promise<PublicOrderView | null>
}

export interface OrderFilters {
  status?: OrderStatus
  delivererId?: string
  createdByUserId?: string
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
}
