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
    deliveryCode?: string
    notes?: string
    lat?: number
    lng?: number
    deliveryAddress?: string
    deliveryLat?: number
    deliveryLng?: number
  },
  { orderRepo, notifyCustomer }: Deps
) {
  const order = await orderRepo.create({
    storeId:         input.storeId,
    customerId:      input.customerId,
    createdByUserId: input.createdByUserId,
    status:          'PREPARING',
    pickupCode:      generateCode(),
    deliveryCode:    input.deliveryCode ?? generateCode(),
    notes:           input.notes,
    lat:             input.lat,
    lng:             input.lng,
    deliveryAddress: input.deliveryAddress,
    deliveryLat:     input.deliveryLat,
    deliveryLng:     input.deliveryLng,
  })

  await notifyCustomer?.(order.id, order.storeId)

  return order
}
