import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Order, OrderStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  PREPARING:        'Preparando',
  ASSIGNED:         'Atribuído',
  ON_ROUTE:         'Em rota',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  PREPARING:        'bg-yellow-100 text-yellow-800',
  ASSIGNED:         'bg-blue-100 text-blue-800',
  ON_ROUTE:         'bg-indigo-100 text-indigo-800',
  OUT_FOR_DELIVERY: 'bg-orange-100 text-orange-800',
  DELIVERED:        'bg-green-100 text-green-800',
  CANCELLED:        'bg-gray-100 text-gray-500',
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day:    '2-digit',
    month:  '2-digit',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

// ── Bandeiras de atraso ────────────────────────────────────────────────────
// As bandeiras são virtuais (calculadas a partir de now()). Os limiares (minutos)
// são configuráveis por loja (settings) — estes são apenas os fallbacks.
export interface DelayThresholds {
  prepYellow:    number  // PREPARING há ≥ X min
  prepRed:       number
  transitYellow: number  // em rota (picked_up) há ≥ X min
  transitRed:    number
}

export const DEFAULT_DELAY_THRESHOLDS: DelayThresholds = {
  prepYellow:    20,
  prepRed:       30,
  transitYellow: 50,
  transitRed:    60,
}

export type DelayLevel = 'none' | 'yellow' | 'red'

export interface DelayInfo {
  level:   DelayLevel
  phase:   'preparing' | 'transit' | null
  minutes: number
}

const NO_DELAY: DelayInfo = { level: 'none', phase: null, minutes: 0 }

/**
 * Calcula o nível de atraso de um pedido em função do tempo parado na fase atual.
 * - PREPARING: tempo desde createdAt.
 * - ON_ROUTE / OUT_FOR_DELIVERY (com pickedUpAt): tempo desde pickedUpAt.
 * - Demais status: sem atraso.
 */
export function getDelayInfo(
  order: Order,
  thresholds: DelayThresholds = DEFAULT_DELAY_THRESHOLDS,
  now: number = Date.now(),
): DelayInfo {
  if (order.status === 'PREPARING') {
    const minutes = (now - new Date(order.createdAt).getTime()) / 60_000
    if (minutes >= thresholds.prepRed)    return { level: 'red',    phase: 'preparing', minutes }
    if (minutes >= thresholds.prepYellow) return { level: 'yellow', phase: 'preparing', minutes }
    return NO_DELAY
  }

  if ((order.status === 'ON_ROUTE' || order.status === 'OUT_FOR_DELIVERY') && order.pickedUpAt) {
    const minutes = (now - new Date(order.pickedUpAt).getTime()) / 60_000
    if (minutes >= thresholds.transitRed)    return { level: 'red',    phase: 'transit', minutes }
    if (minutes >= thresholds.transitYellow) return { level: 'yellow', phase: 'transit', minutes }
    return NO_DELAY
  }

  return NO_DELAY
}

/** Rótulo curto para a bandeira, ex.: "Atrasado · 23min". */
export function delayLabel(info: DelayInfo): string {
  return `Atrasado · ${Math.floor(info.minutes)}min`
}
