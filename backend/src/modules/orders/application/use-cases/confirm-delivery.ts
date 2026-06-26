import { IOrderRepository } from '../ports'
import { PaymentMethod } from '../../domain/entities'
import { haversineMeters } from '../../../../shared/utils/geo'

interface Deps {
  orderRepo: IOrderRepository
  log?: { info: (obj: unknown, msg?: string) => void }
}

export async function confirmDelivery(
  {
    orderId, storeId, delivererId, code, photoUrls, lat, lng,
    requireDeliveryCode = true, note,
    enforceOrder = false, requireProximity = false, proximityMeters = 100,
    payments, cashCollected,
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
  },
  { orderRepo, log }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')

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
  if (requireProximity) {
    if (lat == null || lng == null) {
      throw new Error('Não foi possível confirmar sua localização. Ative o GPS e tente novamente.')
    }
    const destLat = order.customer.lat
    const destLng = order.customer.lng
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

  if (photoUrls && photoUrls.length > 0) {
    for (let i = 0; i < photoUrls.length; i++) {
      await orderRepo.addProof(orderId, photoUrls[i]!, lat, lng, i + 1)
    }
  }

  // Pagamentos recebidos: grava cada um na tabela order_payments. Só registra
  // quando o pedido ainda não foi entregue, para que um reenvio da requisição
  // (timeout no app) não duplique os pagamentos. (As fotos já são idempotentes.)
  if (order.status !== 'DELIVERED' && payments && payments.length > 0) {
    for (const p of payments) {
      await orderRepo.addPayment(orderId, p, delivererId)
    }
  }

  const collected = (payments && payments.length > 0) || cashCollected
  return orderRepo.updateStatus(orderId, 'DELIVERED', {
    deliveredAt:  new Date(),
    deliveryNote: note || undefined,
    cashCollected: collected ? true : undefined,
  })
}
