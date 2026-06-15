export type OrderStatus =
  | 'PREPARING'
  | 'ASSIGNED'
  | 'ON_ROUTE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'

export interface Order {
  id: string
  storeId: string
  delivererId?: string
  customerId: string
  createdByUserId: string
  status: OrderStatus
  routeId?: string
  routePosition?: number
  pickupCode: string
  deliveryCode: string
  notes?: string
  paymentMethod: 'prepaid' | 'cash' | 'card'
  cashAmount?: number
  cashCollected: boolean
  lat?: number
  lng?: number
  deliveryAddress?: string
  deliveryLat?: number
  deliveryLng?: number
  createdAt: Date
  pickedUpAt?: Date
  outForDeliveryAt?: Date
  arrivedAt?: Date
  deliveredAt?: Date
  deliveryNote?: string
  cancelReason?: string
  rating?: number
  ratingComment?: string
  ratedAt?: Date
  log?: OrderLogEntry[]
  summary?: OrderSummary
}

// Entrada de auditoria: quem fez, quando e o quê.
export interface OrderLogEntry {
  at:       string   // ISO timestamp
  by:       { type: 'store_user' | 'deliverer' | 'system'; id?: string; name?: string }
  action:   string   // CREATED | ASSIGNED | PICKED_UP | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | RETURNED_TO_QUEUE | NOTE_CHANGED | ADDRESS_CHANGED
  details?: Record<string, unknown>
}

// Tempos entre cada mudança de status, calculado no momento da entrega.
export interface OrderSummary {
  totalSeconds: number
  segments: { from: string; to: string; seconds: number }[]
}

export interface OrderWithDetails extends Order {
  customer: {
    id: string
    name: string
    phone: string
    address: string
    complement?: string
    lat?: number
    lng?: number
  }
  deliverer?: {
    id: string
    name: string
    status: string
  }
  proof?: {
    photoUrl: string
    lat?: number
    lng?: number
  }
  // All proof photos (one element for old orders, multiple for new)
  proofs: Array<{
    photoUrl: string
    lat?: number
    lng?: number
  }>
  // Entregue a mais de 100m do local esperado (comprovante x endereço/override).
  deliveredOffTarget?: boolean
}

export const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  PREPARING:        ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:         ['ON_ROUTE', 'PREPARING', 'CANCELLED'],
  ON_ROUTE:         ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED:        [],
  CANCELLED:        [],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return validTransitions[from].includes(to)
}

// Códigos de motivo de cancelamento (entregador). Guardados em orders.cancel_reason
// para permitir GROUP BY nos relatórios de erros de operação. O texto livre do
// motivo 'OTHER' vai para delivery_note.
export const CANCEL_REASON_CODES = ['MISSING_ITEM', 'WRONG_ORDER', 'OTHER'] as const
export type CancelReasonCode = typeof CANCEL_REASON_CODES[number]
