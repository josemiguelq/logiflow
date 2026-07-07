'use client'

import { Crown } from 'lucide-react'
import { useNow } from '@/hooks/useNow'

/**
 * Bandeira de prioridade (coroa). Âmbar normalmente; vermelha quando o horário
 * máximo de entrega já passou. Mostra a hora-limite quando fornecida.
 */
export function PriorityBadge({ maxDeliveryTime }: { maxDeliveryTime?: string | null }) {
  const now = useNow()
  const overdue = !!maxDeliveryTime && new Date(maxDeliveryTime).getTime() < now

  const label = maxDeliveryTime
    ? `até ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(maxDeliveryTime))}`
    : 'Prioridade'

  return (
    <span
      title={overdue ? 'Prazo de entrega estourado' : 'Pedido prioritário'}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      <Crown className="h-3 w-3" fill="currentColor" />
      {label}
    </span>
  )
}
