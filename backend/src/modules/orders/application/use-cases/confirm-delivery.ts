import { IOrderRepository } from '../ports'

interface Deps { orderRepo: IOrderRepository }

export async function confirmDelivery(
  {
    orderId, storeId, delivererId, code, photoUrls, lat, lng,
    requireDeliveryCode = true, note,
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
  },
  { orderRepo }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')

  if (requireDeliveryCode && code && order.deliveryCode.trim() !== code.trim().toUpperCase()) {
    throw new Error('Código de entrega incorreto')
  }

  if (photoUrls && photoUrls.length > 0) {
    for (let i = 0; i < photoUrls.length; i++) {
      await orderRepo.addProof(orderId, photoUrls[i]!, lat, lng, i + 1)
    }
  }

  return orderRepo.updateStatus(orderId, 'DELIVERED', {
    deliveredAt:  new Date(),
    deliveryNote: note || undefined,
  })
}
