export interface CustomerAddress {
  id: string
  label: string
  address: string
  complement?: string
  lat?: number
  lng?: number
  isDefault: boolean
}

export interface Customer {
  id: string
  storeId: string
  name: string
  phone: string
  address: string
  complement?: string
  lat?: number
  lng?: number
  addresses: CustomerAddress[]
  createdAt: Date
}
