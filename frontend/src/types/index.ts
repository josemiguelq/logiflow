export type OrderStatus =
  | 'PREPARING'
  | 'ASSIGNED'
  | 'ON_ROUTE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'

export interface Customer {
  id: string
  name: string
  phone: string
  address: string
  complement?: string
  lat?: number
  lng?: number
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

export interface StoreUser {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'MANAGER' | 'ASSISTANT'
  storeId: string
}

export interface AuthState {
  token: string | null
  user: StoreUser | null
}
