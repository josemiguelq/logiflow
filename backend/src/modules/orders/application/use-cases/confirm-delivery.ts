import { IOrderRepository } from '../ports'

interface Deps { orderRepo: IOrderRepository }

export async function confirmDelivery(
  {
    orderId, storeId, delivererId, code, photoUrl, lat, lng,
  }: {
    orderId: string
    storeId: string
    delivererId: string
    code: string
    photoUrl?: string
    lat?: number
    lng?: number
  },
  { orderRepo }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')
  if (order.status !== 'OUT_FOR_DELIVERY') throw new Error('Order not out for delivery')
  if (order.deliveryCode !== code.toUpperCase()) throw new Error('Invalid delivery code')

  if (photoUrl) {
    await orderRepo.addProof(orderId, photoUrl, lat, lng)
  }

  return orderRepo.updateStatus(orderId, 'DELIVERED', { deliveredAt: new Date() })
}
