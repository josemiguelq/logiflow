export interface Customer {
  id: string
  storeId: string
  name: string
  phone: string
  address: string
  complement?: string
  lat?: number
  lng?: number
  createdAt: Date
}
