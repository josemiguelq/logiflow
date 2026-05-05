import { IOrderRepository } from '../ports'
import { generateCode } from '../../../../shared/utils/code-generator'

interface Deps {
  orderRepo: IOrderRepository
  notifyCustomer?: (orderId: string, storeId: string) => Promise<void>
}

export async function createOrder(
  input: {
    storeId: string
    customerId: string
    createdByUserId: string
    notes?: string
    lat?: number
    lng?: number
  },
  { orderRepo, notifyCustomer }: Deps
) {
  const order = await orderRepo.create({
    storeId:         input.storeId,
    customerId:      input.customerId,
    createdByUserId: input.createdByUserId,
    status:          'PREPARING',
    pickupCode:      generateCode(),
    deliveryCode:    generateCode(),
    notes:           input.notes,
    lat:             input.lat,
    lng:             input.lng,
  })

  await notifyCustomer?.(order.id, order.storeId)

  return order
}
