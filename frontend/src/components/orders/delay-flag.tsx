import { Flag } from 'lucide-react'
import { DelayLevel } from '@/types'
import { delayLabel } from '@/lib/utils'

interface Props {
  level: DelayLevel
  minutes?: number
  phase?: 'preparing' | 'transit'
}

/** Bandeira de atraso (amarela/vermelha) para cards e detalhe de pedido. */
export function DelayFlag({ level, minutes, phase }: Props) {
  if (!level || level === 'none') return null
  const red = level === 'red'
  const phaseLabel = phase === 'transit' ? 'em rota' : phase === 'preparing' ? 'em preparação' : ''
  const title = phaseLabel
    ? `Pedido ${phaseLabel}${minutes != null ? ` há ${Math.floor(minutes)} min` : ''}`
    : 'Pedido atrasado'
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        red ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      <Flag className="h-3 w-3" fill="currentColor" />
      {delayLabel(minutes)}
    </span>
  )
}
