import { IOrderRepository } from '../ports'
import { PaymentMethod, OrderLogEntry, OrderWithDetails } from '../../domain/entities'
import { haversineMeters } from '../../../../shared/utils/geo'
import { computeSummary, detectInconsistencies } from '../order-summary'

interface Deps {
  orderRepo: IOrderRepository
  log?: { info: (obj: unknown, msg?: string) => void }
}

export async function confirmDelivery(
  {
    orderId, storeId, delivererId, code, photoUrls, lat, lng,
    requireDeliveryCode = true, note,
    enforceOrder = false, requireProximity = false, proximityMeters = 100,
    payments, cashCollected, by,
  }: {
    orderId: string
    storeId: string
    delivererId: string
    code: string
    photoUrls?: string[]
    lat?: number
    lng?: number
    requireDeliveryCode?: boolean
    note?: string
    enforceOrder?: boolean
    requireProximity?: boolean
    proximityMeters?: number
    payments?: { amount: number; method: PaymentMethod }[]
    cashCollected?: boolean
    // Autor da ação, para a entrada de auditoria DELIVERED gravada junto à entrega.
    by: OrderLogEntry['by']
  },
  { orderRepo, log }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')

  // Idempotência: se o pedido já foi entregue, não reprocessa. Um reenvio da
  // requisição (timeout no app → entregador toca "Confirmar" de novo) não deve
  // duplicar fotos, pagamentos, log de auditoria nem a notificação ao cliente.
  // Retorna sucesso com o pedido atual para o app fechar a tela normalmente.
  if (order.status === 'DELIVERED') {
    return { order, alreadyDelivered: true }
  }

  if (requireDeliveryCode && code && order.deliveryCode.trim() !== code.trim().toUpperCase()) {
    throw new Error('Código de entrega incorreto')
  }

  // Ordem da rota: não permite pular paradas quando a loja exige seguir a ordem.
  if (enforceOrder && order.routeId && order.routePosition != null) {
    const minPos = await orderRepo.getMinPendingRoutePosition(order.routeId)
    if (minPos != null && order.routePosition > minPos) {
      throw new Error(
        `Siga a ordem da rota: conclua primeiro a entrega anterior (parada #${minPos}).`
      )
    }
  }

  // Proximidade: só bloqueia quando a loja exige entregar perto do endereço.
  // Para entrega terceirizada, o alvo é o endereço da AGÊNCIA, não o do cliente.
  if (requireProximity) {
    if (lat == null || lng == null) {
      throw new Error('Não foi possível confirmar sua localização. Ative o GPS e tente novamente.')
    }
    const destLat = order.agency?.lat ?? order.customer.lat
    const destLng = order.agency?.lng ?? order.customer.lng
    if (destLat != null && destLng != null) {
      const dist = haversineMeters(lat, lng, destLat, destLng)
      if (dist > proximityMeters) {
        throw new Error(
          `Você está a ${Math.round(dist)} m do endereço; é necessário estar a até ${proximityMeters} m para concluir a entrega.`
        )
      }
    } else {
      // Sem coordenadas do destino não há como medir — libera e registra.
      log?.info({ orderId, storeId }, '[deliver] proximity required but order has no coordinates — allowing')
    }
  }

  // Dinheiro só pode ser recebido em um único pagamento por entrega (Pix e cartão
  // podem se repetir). Validado no servidor para não depender só do cliente.
  if (payments && payments.filter(p => p.method === 'cash').length > 1) {
    throw new Error('Só é permitido um pagamento em dinheiro por entrega')
  }

  const collected = (payments && payments.length > 0) || cashCollected
  const deliveredAt = new Date()

  // Auditoria + summary calculados em memória a partir do log já carregado, evitando
  // reler o pedido (findById pesado) só para computar os segmentos de tempo.
  const deliveredEntry: OrderLogEntry = { at: deliveredAt.toISOString(), by, action: 'DELIVERED' }
  const fullLog = [...(order.log ?? []), deliveredEntry]
  const inconsistencies = detectInconsistencies(order, { lat, lng, payments })
  const summary = {
    ...computeSummary(fullLog),
    ...(inconsistencies.length ? { inconsistencies } : {}),
  }

  // Escritas independentes em PARALELO: comprovantes (proof_of_delivery),
  // pagamentos (order_payments) e a finalização (orders) tocam tabelas/linhas
  // distintas — não há corrida entre elas. Evita somar os round-trips
  // sequenciais que antes rodavam um a um. Reenvios de um pedido já entregue nem
  // chegam aqui (early-return acima), então não duplicam.
  await Promise.all([
    ...(photoUrls ?? []).map((url, i) => orderRepo.addProof(orderId, url, lat, lng, i + 1)),
    ...(payments ?? []).map(p => orderRepo.addPayment(orderId, p, delivererId)),
    orderRepo.finalizeDelivered(orderId, {
      deliveredAt,
      deliveryNote:  note || undefined,
      cashCollected: collected ? true : undefined,
      logEntry:      deliveredEntry,
      summary,
    }),
  ])

  // Objeto enriquecido (com customer/deliverer do findById inicial) para o broadcast
  // e a resposta — sem uma segunda ida ao banco.
  const finalized: OrderWithDetails = {
    ...order,
    status:        'DELIVERED',
    deliveredAt,
    deliveryNote:  note || order.deliveryNote,
    cashCollected: collected ? true : order.cashCollected,
    log:           fullLog,
    summary,
  }
  return { order: finalized, alreadyDelivered: false }
}
