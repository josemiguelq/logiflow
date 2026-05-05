import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { OrderStatus } from '@/types'

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
