import { IOrderRepository } from '../ports'

interface Deps { orderRepo: IOrderRepository }

export async function confirmPickup(
  { orderId, storeId, delivererId, code }:
    { orderId: string; storeId: string; delivererId: string; code: string },
  { orderRepo }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (order.delivererId !== delivererId) throw new Error('Not your order')
  if (order.status !== 'ASSIGNED') throw new Error('Order not assigned')
  if (order.pickupCode.trim() !== code.trim().toUpperCase()) throw new Error('Invalid pickup code')

  return orderRepo.updateStatus(orderId, 'ON_ROUTE', { pickedUpAt: new Date() })
}
