export interface Agency {
  id: string
  storeId: string
  name: string
  address: string
  lat: number | null
  lng: number | null
  createdAt: Date
  updatedAt: Date
}
