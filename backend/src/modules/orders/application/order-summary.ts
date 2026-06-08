import { OrderLogEntry, OrderSummary } from '../domain/entities'

// Marcos de status na ordem cronológica esperada do ciclo de vida do pedido.
const STATUS_MILESTONES = [
  'CREATED',
  'ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
]

/**
 * Calcula o tempo entre cada mudança de status a partir do log de auditoria.
 * Considera apenas as entradas de marco de status, ordenadas por horário, e
 * gera um segmento por par consecutivo. Usado no momento da entrega.
 */
export function computeSummary(log: OrderLogEntry[]): OrderSummary {
  const milestones = log
    .filter(e => STATUS_MILESTONES.includes(e.action))
    .map(e => ({ action: e.action, t: new Date(e.at).getTime() }))
    .filter(e => Number.isFinite(e.t))
    .sort((a, b) => a.t - b.t)

  const segments: OrderSummary['segments'] = []
  for (let i = 1; i < milestones.length; i++) {
    const prev = milestones[i - 1]!
    const cur  = milestones[i]!
    segments.push({
      from:    prev.action,
      to:      cur.action,
      seconds: Math.max(0, Math.round((cur.t - prev.t) / 1000)),
    })
  }

  const totalSeconds = milestones.length >= 2
    ? Math.max(0, Math.round((milestones[milestones.length - 1]!.t - milestones[0]!.t) / 1000))
    : 0

  return { totalSeconds, segments }
}
