import 'dotenv/config'
import dns from 'dns'

// Must run before any network connections — Render exposes IPv6 addresses
// but only IPv4 is routable on the internal network.
dns.setDefaultResultOrder('ipv4first')

import { buildApp } from './app'
import { createNotificationWorker } from './shared/infra/queue'
import { db } from './shared/db/client'
import { createBaileysProvider } from './modules/notifications/infrastructure/baileys/baileys-provider'
import { createPgMessageLogRepo } from './modules/notifications/infrastructure/repositories/pg-message-log-repo'
import { sendDeliveryNotification } from './modules/notifications/application/use-cases/send-delivery-notification'
import { createPgOrderRepo } from './modules/orders/infrastructure/repositories/pg-order-repo'

async function start() {
  const app            = buildApp()
  const whatsapp       = createBaileysProvider(db)
  const messageLogRepo = createPgMessageLogRepo(db)
  const orderRepo      = createPgOrderRepo(db)

  // ── Notification worker ──────────────────────────────────────────────────
  createNotificationWorker(async (job) => {
    const { storeId, orderId, phone: rawPhone } = job.data

    const order = await orderRepo.findById(orderId, storeId)
    if (!order) return

    const phone = order.customer.phone
    const trackingUrl = `${process.env.TRACKING_BASE_URL ?? 'http://localhost:3000/tracking'}/${orderId}`

    await sendDeliveryNotification(
      {
        storeId,
        orderId,
        phone,
        customerName: order.customer.name,
        trackingUrl,
        deliveryCode: order.deliveryCode,
      },
      { whatsapp, messageLog: messageLogRepo }
    ).catch((err) => app.log.warn({ err }, 'notification failed (non-fatal)'))
  })

  // ── HTTP server ──────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`LogiFlow backend running on http://0.0.0.0:${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
