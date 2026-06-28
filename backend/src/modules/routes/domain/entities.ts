export type RouteStatus = 'CREATED' | 'STARTED' | 'FINISHED'

// Entrada de auditoria da rota: quem fez, quando e o quê (espelha OrderLogEntry).
export interface RouteLogEntry {
  at:       string   // ISO timestamp
  by:       { type: 'store_user' | 'deliverer' | 'system'; id?: string; name?: string }
  action:   string   // CREATED | STARTED | FINISHED | ORDER_ADDED | ORDER_RETURNED_TO_QUEUE | ORDER_CANCELLED | ORDER_DELIVERED
  details?: Record<string, unknown>
}

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
  log: RouteLogEntry[]
}

export interface RouteOrderItem {
  id: string
  customerName: string
  customerAddress: string
  deliveryCode: string
  status: string
  routePosition?: number
  createdAt?: Date
  pickedUpAt?: Date
  deliveredAt?: Date
  // Entregue a >100m do local esperado (comprovante x endereço/override).
  deliveredOffTarget?: boolean
}
