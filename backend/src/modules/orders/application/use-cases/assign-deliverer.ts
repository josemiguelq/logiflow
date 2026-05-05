import { IOrderRepository } from '../ports'
import { canTransition } from '../../domain/entities'

interface Deps { orderRepo: IOrderRepository }

export async function assignDeliverer(
  { orderId, storeId, delivererId, routePosition }:
    { orderId: string; storeId: string; delivererId: string; routePosition?: number },
  { orderRepo }: Deps
) {
  const order = await orderRepo.findById(orderId, storeId)
  if (!order) throw new Error('Order not found')
  if (!canTransition(order.status, 'ASSIGNED')) {
    throw new Error(`Cannot assign from status ${order.status}`)
  }

  return orderRepo.assignDeliverer(orderId, delivererId, routePosition ?? 1)
}
