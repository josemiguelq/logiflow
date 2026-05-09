import { IOrderRepository } from '../ports'

interface Deps { orderRepo: IOrderRepository }

export async function confirmDelivery(
  {
    orderId, storeId, delivererId, code, photoUrl, lat, lng,
    requireDeliveryCode = true, note,
  }: {
    orderId: string
    storeId: string
    delivererId: string
    code: string
    photoUrl?: string
    lat?: number
    lng?: number
    requireDeliveryCode?: boolean
    note?: string
  },
  { orderRepo }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')

  if (requireDeliveryCode && code && order.deliveryCode !== code.toUpperCase()) {
    throw new Error('Código de entrega incorreto')
  }

  if (photoUrl) {
    await orderRepo.addProof(orderId, photoUrl, lat, lng)
  }

  return orderRepo.updateStatus(orderId, 'DELIVERED', {
    deliveredAt:  new Date(),
    deliveryNote: note || undefined,
  })
}
