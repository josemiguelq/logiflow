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

// Uma entrada do histórico de alterações do cliente (quem/quando/o quê).
export interface CustomerAuditChange {
  field: string
  before: unknown
  after: unknown
}

export interface CustomerAuditEntry {
  changedBy: string | null
  changedByName: string | null
  changedAt: string
  changes: CustomerAuditChange[]
}

export interface Customer {
  id: string
  storeId: string
  name: string
  phone: string
  addresses: CustomerAddress[]
  createdAt: Date
  updatedAt: Date
  audit: CustomerAuditEntry[]
}
