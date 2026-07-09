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

export interface Assistance {
  id: string
  name: string
}

export interface Customer {
  id: string
  name: string
  phone: string
  assistanceId?: string | null
  assistanceName?: string | null
  addresses: CustomerAddress[]
  createdAt: string
  updatedAt: string
  audit: CustomerAuditEntry[]
  warrantyAccepted?: boolean
}

export interface Deliverer {
  id: string
  name: string
  username: string
  email?: string
  status: 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE'
  isActive: boolean
  needsOnboarding: boolean
  profileImageUrl?: string
  createdAt: string
  termsAccepted?: boolean
  termsAcceptedAt?: string | null
}

export interface OrderLogEntry {
  at: string
  by: { type: string; id?: string; name?: string }
  action: string
  details?: Record<string, unknown>
}

export interface OrderSummary {
  totalSeconds: number
  segments: { from: string; to: string; seconds: number }[]
}

export interface Order {
  id: string
  storeId: string
  status: OrderStatus
  routeId?: string
  routePosition?: number
  pickupCode: string
  deliveryCode: string
  notes?: string
  isPriority?: boolean
  maxDeliveryTime?: string
  deliveryNote?: string
  cancelReason?: string
  createdAt: string
  pickedUpAt?: string
  outForDeliveryAt?: string
  arrivedAt?: string
  deliveredAt?: string
  log?: OrderLogEntry[]
  summary?: OrderSummary
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
  paymentMethod: 'prepaid' | 'cash' | 'card'
  cashAmount?: number
  cashCollected: boolean
  proof?: {
    photoUrl: string
    lat?: number
    lng?: number
  }
  proofs: Array<{
    photoUrl: string
    lat?: number
    lng?: number
  }>
  payments?: Array<{
    amount: number
    method: 'cash' | 'pix' | 'card'
    createdAt: string
  }>
  deliveredOffTarget?: boolean
}

export interface OrderMessage {
  id: string
  message: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  createdAt: string
}

// Mensagem do chat do pedido (operador ↔ entregador).
export interface ChatMessage {
  id: string
  orderId: string
  senderType: 'store_user' | 'deliverer'
  senderId: string
  senderName: string
  body: string
  createdAt: string
}

// Não-lidas por pedido (badge nos cards).
export interface OrderUnread {
  orderId: string
  count: number
}

export type RouteStatus = 'CREATED' | 'STARTED' | 'FINISHED'

export interface RouteOrderItem {
  id: string
  customerName: string
  customerAddress: string
  deliveryCode: string
  status: string
  routePosition?: number
  createdAt?: string
  pickedUpAt?: string
  arrivedAt?: string
  deliveredAt?: string
  deliveredOffTarget?: boolean
  paymentMethod: 'prepaid' | 'cash' | 'card'
  cashAmount?: number
  cashCollected: boolean
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
  log?: RouteLogEntry[]
}

export interface RouteLogEntry {
  at:       string
  by:       { type: 'store_user' | 'deliverer' | 'system'; id?: string; name?: string }
  action:   string
  details?: Record<string, unknown>
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

export interface WarrantyQuestion {
  id: string
  label: string
  required: boolean
}

export interface WarrantyAnswer {
  questionId: string
  label: string
  answer: boolean
}

export type WarrantyStandingStatus = 'confirmed' | 'pending' | 'outdated'

// Linha do painel do operador: standing de garantia por cliente.
export interface WarrantyClientListItem {
  customerId: string
  customerName: string
  status: WarrantyStandingStatus
  currentVersion: number | null
  lastConfirmedVersion: number | null
  lastConfirmedAt: string | null
}

// Um aceite (assinatura) de uma versão específica dos termos.
export interface WarrantyAcceptance {
  id: string
  termsVersion: number
  status: 'pending' | 'confirmed'
  questionsSnapshot: WarrantyQuestion[] | null
  answers: WarrantyAnswer[] | null
  signaturePath: string | null
  responseIp: string | null
  responseUserAgent: string | null
  confirmedAt: string | null
  createdAt: string
}

// Detalhe do cliente: link estável + histórico de aceites por versão.
export interface WarrantyClientDetail {
  customerId: string
  customerName: string
  token: string | null
  currentVersion: number | null
  acceptances: WarrantyAcceptance[]
}

export interface PagedWarranties {
  items: WarrantyClientListItem[]
  total: number
  page: number
  pages: number
}

export interface CreateWarrantyResponse {
  id: string
  token: string
  publicUrl: string
  shortLink: string
  qrDataUrl: string
}

export interface WarrantyPublic {
  status: 'pending' | 'confirmed'
  customerName: string
  videoUrl: string | null
  questions: WarrantyQuestion[]
  storeTheme: {
    storeName: string | null
    logoUrl: string | null
    primary: string
    secondary: string
    accent: string
  } | null
  answers?: WarrantyAnswer[]
  signaturePath?: string | null
  confirmedAt?: string | null
}

export interface WarrantyConfig {
  id: string
  storeId: string
  videoUrl: string | null
  questions: WarrantyQuestion[]
  currentVersion: number | null
  currentPublishedAt: string | null
  draftDirty: boolean
}
