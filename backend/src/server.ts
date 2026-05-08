import 'dotenv/config'
import { buildApp } from './app'
import { createNotificationWorker } from './shared/infra/queue'
import { db } from './shared/db/client'
import { createBaileysProvider } from './modules/notifications/infrastructure/baileys/baileys-provider'
import { createPgMessageLogRepo } from './modules/notifications/infrastructure/repositories/pg-message-log-repo'
import { createPgOrderRepo } from './modules/orders/infrastructure/repositories/pg-order-repo'

function buildStatusMessage(
  statusEvent: string,
  customerName: string,
  trackingUrl: string,
  deliveryCode: string,
): string {
  switch (statusEvent) {
    case 'PREPARING':
      return `Olá, ${customerName}! Seu pedido foi registrado e está sendo preparado. 🛒\n\nAcompanhe em tempo real:\n${trackingUrl}`
    case 'ASSIGNED':
      return `Olá, ${customerName}! Seu pedido foi atribuído a um entregador e logo vai sair. 📦\n\nAcompanhe em tempo real:\n${trackingUrl}`
    case 'ON_ROUTE':
      return `Olá, ${customerName}! O entregador retirou seus pedidos da loja e está a caminho. 🚴\n\nAcompanhe em tempo real:\n${trackingUrl}`
    case 'OUT_FOR_DELIVERY':
      return (
        `Olá, ${customerName}! Seu pedido está saindo para entrega agora! 🏃\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}\n\n` +
        `Código de confirmação: *${deliveryCode}*`
      )
    case 'DELIVERED':
      return `Olá, ${customerName}! Seu pedido foi entregue com sucesso. ✅\n\nObrigado por comprar conosco!`
    case 'CANCELLED':
      return `Olá, ${customerName}! Infelizmente seu pedido foi cancelado. ❌\n\nPara dúvidas, entre em contato com a loja.`
    default:
      return `Olá, ${customerName}! O status do seu pedido foi atualizado.\n\nAcompanhe em tempo real:\n${trackingUrl}`
  }
}

async function start() {
  const app            = buildApp()
  const whatsapp       = createBaileysProvider(db)
  const messageLogRepo = createPgMessageLogRepo(db)
  const orderRepo      = createPgOrderRepo(db)

  // ── Notification worker ──────────────────────────────────────────────────
  createNotificationWorker(async (job) => {
    const { storeId, orderId, statusEvent } = job.data

    const order = await orderRepo.findById(orderId, storeId)
    if (!order) return

    const phone = order.customer.phone
    if (!phone) return

    const trackingUrl = `${process.env.TRACKING_BASE_URL ?? 'http://localhost:3000/tracking'}/${orderId}`
    const message = buildStatusMessage(statusEvent, order.customer.name, trackingUrl, order.deliveryCode)

    const logId = await messageLogRepo.log({ storeId, orderId, phone, message })
    try {
      await whatsapp.sendMessage(`+55${phone}`, message)
      await messageLogRepo.markSent(logId)
    } catch (err) {
      await messageLogRepo.markFailed(logId)
      app.log.warn({ err, orderId, statusEvent }, 'WhatsApp notification failed (non-fatal)')
    }
  })

  // ── Reconnect previously active WhatsApp sessions ────────────────────────
  whatsapp.reconnectAll().catch((err) => app.log.warn({ err }, 'WhatsApp reconnect failed'))

  // ── HTTP server ──────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`LogiFlow backend running on http://0.0.0.0:${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
