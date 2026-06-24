import { IWhatsAppProvider, IMessageLogRepository } from '../../domain/ports'

interface Deps {
  whatsapp: IWhatsAppProvider
  messageLog: IMessageLogRepository
}

export async function sendDeliveryNotification(
  {
    storeId,
    orderId,
    phone,
    customerName,
    trackingUrl,
    deliveryCode,
  }: {
    storeId: string
    orderId: string
    phone: string
    customerName: string
    trackingUrl: string
    deliveryCode: string
  },
  { whatsapp, messageLog }: Deps
) {
  const message =
    `Olá, ${customerName}! Seu pedido está a caminho. 🚴\n\n` +
    `Acompanhe sua entrega em tempo real:\n${trackingUrl}\n\n` +
    `Código de confirmação: *${deliveryCode}*`

  const logId = await messageLog.log({ storeId, orderId, phone, message })

  try {
    await whatsapp.sendMessage(storeId, phone, message)
    await messageLog.markSent(logId)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await messageLog.markFailed(logId, reason)
    throw new Error('Failed to send WhatsApp message')
  }
}
