import { Flag } from 'lucide-react'
import { DelayInfo, delayLabel } from '@/lib/utils'

/** Bandeira de atraso (amarela/vermelha) para cards e detalhe de pedido. */
export function DelayFlag({ delay }: { delay: DelayInfo }) {
  if (delay.level === 'none') return null
  const red = delay.level === 'red'
  const phaseLabel = delay.phase === 'preparing' ? 'em preparação' : 'em rota'
  return (
    <span
      title={`Pedido ${phaseLabel} há ${Math.floor(delay.minutes)} min`}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        red ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'
      }`}
    >
      <Flag className="h-3 w-3" fill="currentColor" />
      {delayLabel(delay)}
    </span>
  )
}
