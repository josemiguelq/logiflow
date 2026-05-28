import 'dotenv/config'
import { buildApp } from './app'
import { createNotificationWorker } from './shared/infra/queue'
import { db } from './shared/db/client'
import { createBaileysProvider } from './modules/notifications/infrastructure/baileys/baileys-provider'
import { createPgMessageLogRepo } from './modules/notifications/infrastructure/repositories/pg-message-log-repo'
import { createPgOrderRepo } from './modules/orders/infrastructure/repositories/pg-order-repo'
import { createFcmProvider } from './modules/notifications/infrastructure/fcm/fcm-provider'
import { createPgDeviceTokenRepo } from './modules/notifications/infrastructure/repositories/pg-device-token-repo'
import { buildPushPayload } from './modules/notifications/application/use-cases/build-push-payload'
import { startHeartbeat } from './shared/infra/websocket'

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET is not set. Refusing to start in production.')
  process.exit(1)
}

function buildStatusMessage(
  statusEvent: string,
  customerName: string,
  trackingUrl: string,
  deliveryCode: string,
  deliveryAddress: string,
  delivererName: string | undefined,
): string {
  const addrLine     = `📍 Endereço de entrega: *${deliveryAddress}*`
  const delivLine    = delivererName ? `🛵 Entregador: *${delivererName}*` : ''
  const infoBlock    = [addrLine, delivLine].filter(Boolean).join('\n')

  switch (statusEvent) {
    case 'PREPARING':
      return (
        `Olá, ${customerName}! Seu pedido foi registrado e está sendo preparado. 🛒\n\n` +
        `${addrLine}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}`
      )
    case 'ASSIGNED':
      return (
        `Olá, ${customerName}! Seu pedido foi atribuído a um entregador e logo vai sair. 📦\n\n` +
        `${infoBlock}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}`
      )
    case 'ON_ROUTE':
      return (
        `Olá, ${customerName}! O entregador retirou seus pedidos da loja e está a caminho. 🚴\n\n` +
        `${infoBlock}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}`
      )
    case 'OUT_FOR_DELIVERY':
      return (
        `Olá, ${customerName}! Seu pedido está saindo para entrega agora! 🏃\n\n` +
        `${infoBlock}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}\n\n` +
        `Código de confirmação: *${deliveryCode}*`
      )
    case 'DELIVERED':
      return (
        `Olá, ${customerName}! Seu pedido foi entregue com sucesso. ✅\n\n` +
        `${addrLine}\n\n` +
        `Obrigado por comprar conosco!`
      )
    case 'CANCELLED':
      return `Olá, ${customerName}! Infelizmente seu pedido foi cancelado. ❌\n\nPara dúvidas, entre em contato com a loja.`
    default:
      return (
        `Olá, ${customerName}! O status do seu pedido foi atualizado.\n\n` +
        `${addrLine}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}`
      )
  }
}

async function start() {
  const app            = buildApp()
  const whatsapp       = createBaileysProvider(db)
  const messageLogRepo = createPgMessageLogRepo(db)
  const orderRepo      = createPgOrderRepo(db)
  const pushProvider   = createFcmProvider()
  const deviceTokenRepo = createPgDeviceTokenRepo(db)

  // ── Notification worker ──────────────────────────────────────────────────
  createNotificationWorker(async (job) => {
    // ── Push notification ──
    if (job.data.type === 'push') {
      const { delivererId, orderId, storeId, statusEvent } = job.data
      app.log.info({ orderId, storeId, delivererId, statusEvent }, '[push] job received')

      const tokens = delivererId
        ? await deviceTokenRepo.findByDeliverer(delivererId)
        : await deviceTokenRepo.findByStore(storeId)
      app.log.info({ orderId, storeId, tokenCount: tokens.length }, '[push] tokens found')
      if (tokens.length === 0) {
        app.log.warn({ orderId, storeId }, '[push] no tokens — skipping')
        return
      }

      const order = await orderRepo.findById(orderId, storeId)
      if (!order) {
        app.log.warn({ orderId, storeId }, '[push] order not found — skipping')
        return
      }

      const payload = buildPushPayload(statusEvent, orderId, order.customer.name)
      app.log.info({ orderId, storeId, title: payload.title }, '[push] sending to FCM')
      try {
        const { successCount, failureCount } = await pushProvider.send(tokens, payload)
        app.log.info({ orderId, storeId, successCount, failureCount }, '[push] FCM result')
        if (failureCount > 0) {
          app.log.warn({ orderId, storeId, failureCount }, '[push] some FCM tokens failed')
        }
      } catch (err) {
        app.log.error({ err, orderId, storeId }, '[push] FCM send error')
      }
      return
    }

    // ── WhatsApp notification ──
    const { storeId, orderId, statusEvent } = job.data

    // Abort if the store no longer has the whatsapp feature enabled
    const { rows: feat } = await db.query(
      `SELECT 1 FROM store_features_enabled sfe
       JOIN features f ON f.id = sfe.feature_id
       WHERE sfe.store_id = $1 AND f.name = 'whatsapp'`,
      [storeId]
    )
    if (feat.length === 0) return

    const order = await orderRepo.findById(orderId, storeId)
    if (!order) return

    const phone = order.customer.phone
    if (!phone) return

    const trackingUrl = `${process.env.TRACKING_BASE_URL ?? 'https://logiflow-beige.vercel.app/rastreio'}/${orderId}`
    const message = buildStatusMessage(
      statusEvent,
      order.customer.name,
      trackingUrl,
      order.deliveryCode,
      order.customer.address,
      order.deliverer?.name,
    )

    const logId = await messageLogRepo.log({ storeId, orderId, phone, message })
    try {
      await whatsapp.sendMessage(storeId, phone, message)
      await messageLogRepo.markSent(logId)
    } catch (err) {
      await messageLogRepo.markFailed(logId)
      app.log.warn({ err, orderId, statusEvent }, 'WhatsApp notification failed (non-fatal)')
    }
  })

  // ── Reconnect previously active WhatsApp sessions ────────────────────────
  whatsapp.reconnectAll().catch((err) => app.log.warn({ err }, 'WhatsApp reconnect failed'))

  // ── WebSocket heartbeat ──────────────────────────────────────────────────
  startHeartbeat()

  // ── HTTP server ──────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`LogiFlow backend running on http://0.0.0.0:${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
