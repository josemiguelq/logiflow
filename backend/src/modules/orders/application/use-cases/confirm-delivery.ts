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

  console.log('requireDeliveryCode', requireDeliveryCode)
  console.log('code', code)
  console.log('codeUpper', code.toUpperCase())
  console.log('order.deliveryCode', order.deliveryCode)
  console.log('deliveryCodeTrim', code.trim().toUpperCase())
  console.log('IF', order.deliveryCode.trim() !== code.trim().toUpperCase())

  if (requireDeliveryCode && code && order.deliveryCode.trim() !== code.trim().toUpperCase()) {
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
