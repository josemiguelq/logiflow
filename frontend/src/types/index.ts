export type OrderStatus =
  | 'PREPARING'
  | 'ASSIGNED'
  | 'ON_ROUTE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'

export interface CustomerAddress {
  id: string
  label: string
  address: string
  number?: string
  complement?: string
  lat?: number
  lng?: number
  isDefault: boolean
}

export function fullAddress(addr: Pick<CustomerAddress, 'address' | 'number' | 'complement'>): string {
  const base = addr.number ? `${addr.address}, ${addr.number}` : addr.address
  return addr.complement ? `${base} - ${addr.complement}` : base
}

export interface Customer {
  id: string
  name: string
  phone: string
  addresses: CustomerAddress[]
  createdAt: string
}

export interface Deliverer {
  id: string
  name: string
  username: string
  email?: string
  status: 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE'
  isActive: boolean
  needsOnboarding: boolean
  profileImageUrl?: string
  createdAt: string
}

// Horário de trabalho por dia da semana (0=Domingo … 6=Sábado)
export interface DaySchedule {
  dayOfWeek: number
  active: boolean
  startTime: string       // 'HH:MM'
  endTime: string         // 'HH:MM'
  lunchStart?: string     // 'HH:MM'
  lunchEnd?: string       // 'HH:MM'
}

export type PunctualityState = 'on_time' | 'early' | 'late' | 'absent' | 'off'

export interface Punctuality {
  scheduledStart: string | null
  firstAvailableAt: string | null
  diffMin: number | null
  state: PunctualityState
}

export interface AttendanceRow extends Punctuality {
  id: string
  name: string
}

export interface OrderLogEntry {
  at: string
  by: { type: string; id?: string; name?: string }
  action: string
  details?: Record<string, unknown>
}

export interface OrderSummary {
  totalSeconds: number
  segments: { from: string; to: string; seconds: number }[]
}

export interface Order {
  id: string
  storeId: string
  status: OrderStatus
  routePosition?: number
  pickupCode: string
  deliveryCode: string
  notes?: string
  deliveryNote?: string
  cancelReason?: string
  createdAt: string
  pickedUpAt?: string
  outForDeliveryAt?: string
  arrivedAt?: string
  deliveredAt?: string
  log?: OrderLogEntry[]
  summary?: OrderSummary
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
  paymentMethod: 'prepaid' | 'cash' | 'card'
  cashAmount?: number
  cashCollected: boolean
  proof?: {
    photoUrl: string
    lat?: number
    lng?: number
  }
  proofs: Array<{
    photoUrl: string
    lat?: number
    lng?: number
  }>
  deliveredOffTarget?: boolean
}

export type RouteStatus = 'CREATED' | 'STARTED' | 'FINISHED'

export interface RouteOrderItem {
  id: string
  customerName: string
  customerAddress: string
  deliveryCode: string
  status: string
  routePosition?: number
  createdAt?: string
  pickedUpAt?: string
  arrivedAt?: string
  deliveredAt?: string
  deliveredOffTarget?: boolean
  paymentMethod: 'prepaid' | 'cash' | 'card'
  cashAmount?: number
  cashCollected: boolean
}

export interface DeliveryRoute {
  id: string
  storeId: string
  delivererId: string
  pickupCode: string
  status: RouteStatus
  orderCount: number
  createdAt: string
  startedAt?: string
  finishedAt?: string
  deliverer: { id: string; name: string; username: string }
  orders: RouteOrderItem[]
}

export interface StoreUser {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'ASSISTANT'
  storeId: string
  scopes: string[]
}

export interface AuthState {
  token: string | null
  user: StoreUser | null
}
