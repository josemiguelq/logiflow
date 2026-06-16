export type DelivererStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE'

// Horário de trabalho de um dia da semana (0=Domingo … 6=Sábado).
export interface DaySchedule {
  dayOfWeek: number       // 0..6
  active: boolean
  startTime: string       // 'HH:MM'
  endTime: string         // 'HH:MM'
  lunchStart?: string     // 'HH:MM' | undefined
  lunchEnd?: string       // 'HH:MM' | undefined
}

// Pontualidade do dia: combinado x primeiro AVAILABLE.
export type PunctualityState = 'on_time' | 'early' | 'late' | 'absent' | 'off'

export interface Punctuality {
  scheduledStart: string | null    // 'HH:MM' | null (dia inativo/sem horário)
  firstAvailableAt: string | null  // ISO timestamp | null
  diffMin: number | null           // minutos (negativo=adiantado, positivo=atrasado)
  state: PunctualityState
}

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
