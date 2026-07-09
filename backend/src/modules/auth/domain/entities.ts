export type StoreUserRole = 'OWNER' | 'MANAGER' | 'ASSISTANT'

export interface StoreUser {
  id: string
  storeId: string
  name: string
  email: string
  passwordHash: string | null   // null para usuários que logam só via Google
  googleSub?: string | null     // id da conta Google vinculada (login com Google)
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
  needsOnboarding: boolean
  needsSwitchTour: boolean
  termsAcceptedVersion: string | null
  createdAt: Date
}
