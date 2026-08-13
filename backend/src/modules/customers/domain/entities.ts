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
  assistanceId: string | null
  assistanceName: string | null
  addresses: CustomerAddress[]
  createdAt: Date
  updatedAt: Date
  audit: CustomerAuditEntry[]
  // Cliente já assinou a versão ATUAL dos termos de garantia da loja.
  warrantyAccepted: boolean
  // Entrega terceirizada ("via agência/parceiro"): quando há uma agência vinculada,
  // pedidos deste cliente são criados como terceirizados (levados à agência, ex.:
  // Correios). thirdPartyDelivery é derivado de agencyId != null.
  thirdPartyDelivery: boolean
  agencyId: string | null
  agencyName: string | null
  agencyAddress: string | null
  agencyLat: number | null
  agencyLng: number | null
}
