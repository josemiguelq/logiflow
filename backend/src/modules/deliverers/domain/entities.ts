export type DelivererStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE'

export interface Deliverer {
  id: string
  storeId: string
  name: string
  email?: string
  username: string
  passwordHash: string
  profileImageUrl?: string
  status: DelivererStatus
  isActive: boolean
  needsOnboarding: boolean
  createdAt: Date
}
