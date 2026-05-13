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
  address: string
  number?: string
  complement?: string
  lat?: number
  lng?: number
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
  profileImageUrl?: string
  createdAt: string
}

export interface Order {
  id: string
  storeId: string
  status: OrderStatus
  routePosition?: number
  pickupCode: string
  deliveryCode: string
  notes?: string
  createdAt: string
  pickedUpAt?: string
  deliveredAt?: string
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
}

export type RouteStatus = 'CREATED' | 'STARTED' | 'FINISHED'

export interface RouteOrderItem {
  id: string
  customerName: string
  customerAddress: string
  deliveryCode: string
  status: string
  routePosition?: number
  deliveredAt?: string
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
