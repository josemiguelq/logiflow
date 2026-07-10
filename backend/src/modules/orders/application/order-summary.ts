import { OrderLogEntry, OrderSummary, OrderInconsistency, OrderWithDetails, PaymentMethod } from '../domain/entities'
import { haversineMeters, OFF_TARGET_THRESHOLD_M } from '../../../shared/utils/geo'

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

/**
 * Detecta inconsistências no momento da entrega:
 *  - DELIVERED_OFF_TARGET: entrega registrada a mais de OFF_TARGET_THRESHOLD_M do
 *    endereço esperado do cliente (só avalia com as quatro coordenadas presentes).
 *  - SHORT_PAYMENT: soma dos pagamentos coletados menor que o valor esperado do
 *    pedido (cashAmount).
 * Função pura para facilitar testes.
 */
export function detectInconsistencies(
  order: Pick<OrderWithDetails, 'cashAmount' | 'customer'>,
  delivery: { lat?: number; lng?: number; payments?: { amount: number; method: PaymentMethod }[] },
): OrderInconsistency[] {
  const inconsistencies: OrderInconsistency[] = []

  const { lat, lng } = delivery
  const destLat = order.customer?.lat
  const destLng = order.customer?.lng
  if (lat != null && lng != null && destLat != null && destLng != null) {
    const distanceMeters = haversineMeters(lat, lng, destLat, destLng)
    if (distanceMeters > OFF_TARGET_THRESHOLD_M) {
      inconsistencies.push({
        type: 'DELIVERED_OFF_TARGET',
        details: { distanceMeters: Math.round(distanceMeters), thresholdMeters: OFF_TARGET_THRESHOLD_M },
      })
    }
  }

  const expected = order.cashAmount
  if (expected != null) {
    const collected = (delivery.payments ?? []).reduce((sum, p) => sum + p.amount, 0)
    if (collected < expected) {
      inconsistencies.push({
        type: 'SHORT_PAYMENT',
        details: { expected, collected, shortfall: expected - collected },
      })
    }
  }

  return inconsistencies
}
