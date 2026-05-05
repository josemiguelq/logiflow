export type StoreUserRole = 'OWNER' | 'MANAGER' | 'ASSISTANT'

export interface StoreUser {
  id: string
  storeId: string
  name: string
  email: string
  passwordHash: string
  role: StoreUserRole
  active: boolean
  createdAt: Date
}

export interface Deliverer {
  id: string
  storeId: string
  name: string
  email?: string
  username: string
  passwordHash: string
  profileImageUrl?: string
  status: 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE'
  isActive: boolean
  createdAt: Date
}
