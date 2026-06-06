import type { Queue } from 'bullmq'
import type { IOrderRepository } from '../ports'
import type { NotificationJob } from '../../../../shared/infra/queue'
import { wsHub } from '../../../../shared/infra/websocket'

type PushLevel = 'YELLOW' | 'RED'

interface Logger {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

interface Deps {
  orderRepo:         IOrderRepository
  notificationQueue: Queue<NotificationJob>
  log:               Logger
}

// Dedup em memória: cada pedido dispara no máximo 1 push amarelo e 1 vermelho
// enquanto estiver em rota. Não persiste (bandeiras são virtuais) — em um
// restart do processo um alerta pode ser reenviado, o que é aceitável.
const sentAlerts = new Map<string, PushLevel>()

/**
 * Varre os pedidos em rota (com picked_up_at) e dispara alertas de atraso usando
 * os limiares configurados por loja:
 * - minutos ≥ delay_transit_yellow_min → nível YELLOW
 * - minutos ≥ delay_transit_red_min    → nível RED
 * Para cada disparo: push para o mobile do entregador + toast no frontend (WS).
 */
export async function scanDelayedOrders({ orderRepo, notificationQueue, log }: Deps) {
  let candidates
  try {
    candidates = await orderRepo.findInTransit()
  } catch (err) {
    log.error({ err }, '[delay-scan] failed to query candidates')
    return
  }

  const liveIds = new Set<string>()

  for (const o of candidates) {
    liveIds.add(o.id)
    const already = sentAlerts.get(o.id)
    let level: PushLevel | null = null

    // o.delayLevel já reflete os limiares da loja (lógica central em domain/delay.ts).
    if (o.delayLevel === 'red' && already !== 'RED') {
      level = 'RED'
    } else if (o.delayLevel === 'yellow' && already === undefined) {
      level = 'YELLOW'
    }

    if (!level) continue

    const statusEvent = level === 'RED' ? 'DELAYED_PICKUP_RED' : 'DELAYED_PICKUP_YELLOW'
    const shortId     = '#' + o.id.slice(-8).toUpperCase()

    try {
      // Push para o mobile do entregador (reaproveita o worker de notificações)
      if (o.delivererId) {
        await notificationQueue.add('push', {
          type:        'push',
          delivererId: o.delivererId,
          orderId:     o.id,
          storeId:     o.storeId,
          statusEvent,
        })
      }

      // Toast in-app no frontend (dashboard) via WebSocket
      wsHub.broadcastOrderDelayed(o.storeId, {
        orderId:       o.id,
        level:         level === 'RED' ? 'red' : 'yellow',
        customerName:  o.customerName,
        shortId,
        delivererName: o.delivererName,
        minutes:       Math.floor(o.minutes),
      })

      sentAlerts.set(o.id, level)
      log.info({ orderId: o.id, storeId: o.storeId, level, minutes: Math.floor(o.minutes) }, '[delay-scan] alert dispatched')
    } catch (err) {
      log.error({ err, orderId: o.id }, '[delay-scan] failed to dispatch alert')
    }
  }

  // Limpa do dedup os pedidos que saíram da fase em rota (entregues/cancelados).
  for (const id of sentAlerts.keys()) {
    if (!liveIds.has(id)) sentAlerts.delete(id)
  }
}
