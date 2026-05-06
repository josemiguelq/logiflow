export type RouteStatus = 'CREATED' | 'STARTED' | 'FINISHED'

export interface DeliveryRoute {
  id: string
  storeId: string
  delivererId: string
  pickupCode: string
  status: RouteStatus
  createdAt: Date
  startedAt?: Date
  finishedAt?: Date
}

export interface RouteWithDetails extends DeliveryRoute {
  orderCount: number
  deliverer: { id: string; name: string; username: string }
  orders: RouteOrderItem[]
}

export interface RouteOrderItem {
  id: string
  customerName: string
  customerAddress: string
  deliveryCode: string
  status: string
  routePosition?: number
  deliveredAt?: Date
}
