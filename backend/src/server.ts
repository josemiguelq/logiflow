import 'dotenv/config'
import { buildApp } from './app'
import { createNotificationWorker, notificationQueue } from './shared/infra/queue'
import { scanDelayedOrders } from './modules/orders/application/use-cases/scan-delayed-orders'
import { db } from './shared/db/client'
import { createBaileysProvider } from './modules/notifications/infrastructure/baileys/baileys-provider'
import { createPgMessageLogRepo } from './modules/notifications/infrastructure/repositories/pg-message-log-repo'
import { createPgOrderRepo } from './modules/orders/infrastructure/repositories/pg-order-repo'
import { createFcmProvider } from './modules/notifications/infrastructure/fcm/fcm-provider'
import { createPgDeviceTokenRepo } from './modules/notifications/infrastructure/repositories/pg-device-token-repo'
import { buildPushPayload } from './modules/notifications/application/use-cases/build-push-payload'
import { startHeartbeat } from './shared/infra/websocket'
import { runAchievementsJob } from './modules/gamification/application/service'

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
        `Olá, ${customerName}! Seu pedido é a próxima parada! 🏃\n\n` +
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
    case 'ADDRESS_CHANGED':
      return (
        `Olá, ${customerName}! O endereço de entrega do seu pedido foi atualizado. 📍\n\n` +
        `${addrLine}\n\n` +
        `Acompanhe em tempo real:\n${trackingUrl}`
      )
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
    // ── Pickup reminder push (fan-out para vários entregadores livres) ──
    if (job.data.type === 'pickup_reminder') {
      const { storeId, delivererIds, count, minutes } = job.data
      app.log.info({ storeId, delivererCount: delivererIds.length, count, minutes }, '[push] pickup_reminder received')

      const tokens = await deviceTokenRepo.findByDeliverers(delivererIds)
      app.log.info({ storeId, tokenCount: tokens.length }, '[push] pickup_reminder tokens found')
      if (tokens.length === 0) {
        app.log.warn({ storeId }, '[push] pickup_reminder no tokens — skipping')
        return
      }

      const payload = {
        title: 'Pedidos aguardando retirada 📦',
        body:  `${count} pedido${count !== 1 ? 's' : ''} atrasado${count !== 1 ? 's' : ''} aguardando retirada há mais de ${minutes} min`,
        data:  { event: 'PICKUP_REMINDER' },
      }
      try {
        const { successCount, failureCount } = await pushProvider.send(tokens, payload)
        app.log.info({ storeId, successCount, failureCount }, '[push] pickup_reminder FCM result')
      } catch (err) {
        app.log.error({ err, storeId }, '[push] pickup_reminder FCM send error')
      }
      return
    }

    // ── Entregador concluiu a rota e há pedidos prontos esperando ──
    if (job.data.type === 'route_done_waiting') {
      const { storeId, delivererId, count } = job.data
      app.log.info({ storeId, delivererId, count }, '[push] route_done_waiting received')

      const tokens = await deviceTokenRepo.findByDeliverer(delivererId)
      if (tokens.length === 0) {
        app.log.warn({ storeId, delivererId }, '[push] route_done_waiting no tokens — skipping')
        return
      }

      const payload = {
        title: 'Rota concluída ✅',
        body:  `Há ${count} pedido${count !== 1 ? 's' : ''} pronto${count !== 1 ? 's' : ''} esperando — volte para retirada.`,
        data:  { event: 'ROUTE_DONE_WAITING' },
      }
      try {
        const { successCount, failureCount } = await pushProvider.send(tokens, payload)
        app.log.info({ storeId, delivererId, successCount, failureCount }, '[push] route_done_waiting FCM result')
      } catch (err) {
        app.log.error({ err, storeId, delivererId }, '[push] route_done_waiting FCM send error')
      }
      return
    }

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

    // Abort if this status is not in the store's WhatsApp notify list
    const { rows: [cfg] } = await db.query(
      `SELECT COALESCE(ssv.value, s.default_value) AS value
       FROM settings s
       LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
       WHERE s.name = 'whatsapp_notify_statuses'`,
      [storeId]
    )
    let enabledStatuses: string[] = []
    try { enabledStatuses = JSON.parse((cfg as { value?: string } | undefined)?.value ?? '[]') } catch { enabledStatuses = [] }
    if (!enabledStatuses.includes(statusEvent)) return

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

  // ── Delay scanner: alerta pedidos em rota parados há muito tempo ─────────
  const runDelayScan = () =>
    scanDelayedOrders({ orderRepo, notificationQueue, log: app.log })
      .catch((err) => app.log.error({ err }, '[delay-scan] unexpected error'))
  runDelayScan()
  setInterval(runDelayScan, 60_000)

  // ── Conquistas: backfill no boot (365d) + reavaliação periódica (últimos dias) ──
  runAchievementsJob(365)
    .catch((err) => app.log.error({ err }, '[achievements] backfill failed'))
  setInterval(
    () => runAchievementsJob(3).catch((err) => app.log.error({ err }, '[achievements] job failed')),
    15 * 60_000,
  )

  // ── Retenção: remove sessões de operador antigas (>30 dias sem atividade) ──
  const cleanupSessions = () =>
    db.query(`DELETE FROM store_user_sessions WHERE last_seen_at < now() - interval '30 days'`)
      .catch((err) => app.log.error({ err }, '[sessions] cleanup failed'))
  cleanupSessions()
  setInterval(cleanupSessions, 24 * 60 * 60_000)

  // ── HTTP server ──────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`LogiFlow backend running on http://0.0.0.0:${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
