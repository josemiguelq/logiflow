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
  deliveredAt?: Date
  deliveryNote?: string
  rating?: number
  ratingComment?: string
  ratedAt?: Date
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
