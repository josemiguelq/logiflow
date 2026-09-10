import 'dotenv/config'
import { buildApp, buildTime } from './app'
import { createNotificationWorker, createLocationWorker, notificationQueue } from './shared/infra/queue'
import { createPgTrackingRepo } from './modules/tracking/infrastructure/repositories/pg-tracking-repo'
import { scanDelayedOrders, scanPriorityOverdue } from './modules/orders/application/use-cases/scan-delayed-orders'
import { scanAutoRoutes } from './modules/orders/application/use-cases/scan-auto-routes'
import { createPgAutoRouteRepo } from './modules/auto-routes/infrastructure/repositories/pg-auto-route-repo'
import { db } from './shared/db/client'
import { createCloudApiProvider } from './modules/notifications/infrastructure/cloud-api/cloud-api-provider'
import { TemplateParams } from './modules/notifications/domain/ports'
import { createPgMessageLogRepo } from './modules/notifications/infrastructure/repositories/pg-message-log-repo'
import { createPgOrderRepo } from './modules/orders/infrastructure/repositories/pg-order-repo'
import { createFcmProvider } from './modules/notifications/infrastructure/fcm/fcm-provider'
import { createPgDeviceTokenRepo } from './modules/notifications/infrastructure/repositories/pg-device-token-repo'
import { buildPushPayload } from './modules/notifications/application/use-cases/build-push-payload'
import { startHeartbeat, wsHub } from './shared/infra/websocket'
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
  requireDeliveryCode: boolean,
): string {
  const addrLine     = `📍 Endereço de entrega: *${deliveryAddress}*`
  const delivLine    = delivererName ? `🛵 Entregador: *${delivererName}*` : ''
  const infoBlock    = [addrLine, delivLine].filter(Boolean).join('\n')
  // Só inclui o código quando a loja exige confirmação por código na entrega.
  const codeBlock    = requireDeliveryCode ? `\n\nCódigo de confirmação: *${deliveryCode}*` : ''

  switch (statusEvent) {
    case 'PREPARING':
      return (
        `Olá, ${customerName}! Seu pedido foi registrado e está sendo preparado. 🛒\n\n` +
        `${addrLine}\n\n`
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
        `Acompanhe em tempo real:\n${trackingUrl}` +
        codeBlock
      )
    case 'ARRIVING':
      return (
        `Olá, ${customerName}! O entregador está chegando — já está bem pertinho de você! 📍\n\n` +
        `${infoBlock}\n\n` +
        `Prepare-se para receber seu pedido. 😉` +
        codeBlock
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

// Idioma dos templates aprovados na Meta.
const WA_TEMPLATE_LANG = 'pt_BR'

// Mapeia um statusEvent para o template aprovado + parâmetros, na ordem definida
// em docs/whatsapp-templates.md. O botão de URL (quando existe) usa o orderId como
// sufixo dinâmico do link de rastreio. Retorna null para status sem template.
function buildStatusTemplate(
  statusEvent: string,
  {
    customerName,
    storeName,
    delivererName,
    deliveryCode,
    deliveryAddress,
    orderId,
    requireDeliveryCode,
  }: {
    customerName: string
    storeName: string
    delivererName: string | undefined
    deliveryCode: string
    deliveryAddress: string
    orderId: string
    requireDeliveryCode: boolean
  },
): { name: string; lang: string; params: TemplateParams } | null {
  // A Cloud API rejeita parâmetros vazios — garante um valor não-vazio.
  const customer  = customerName || 'Cliente'
  const store     = storeName || 'a loja'
  const deliverer = delivererName || 'o entregador'
  const address   = deliveryAddress || 'endereço informado no pedido'
  const code      = deliveryCode || '----'
  const track     = orderId // sufixo do botão de URL dinâmico

  // Modo de teste: força o template de amostra JÁ aprovado (en_US) em qualquer
  // status, para validar número/token/webhook enquanto os templates reais estão
  // em revisão. O corpo dele tem 3 variáveis: nome, nº do pedido e data.
  if (process.env.WHATSAPP_TEST_TEMPLATE === 'true') {
    return {
      name: 'jaspers_market_order_confirmation_v1',
      lang: 'en_US',
      params: { body: [customer, orderId, new Date().toLocaleDateString('pt-BR')] },
    }
  }

  const selected: { name: string; params: TemplateParams } | null = (() => {
    switch (statusEvent) {
      case 'PREPARING':
        return { name: 'order_preparing', params: { body: [customer, store, address] } }
      case 'ASSIGNED':
        return { name: 'order_assigned', params: { body: [customer, store, deliverer], buttonUrlSuffix: track } }
      case 'ON_ROUTE':
        return { name: 'order_on_route', params: { body: [customer, store, deliverer], buttonUrlSuffix: track } }
      case 'OUT_FOR_DELIVERY':
        return requireDeliveryCode
          ? { name: 'order_out_for_delivery', params: { body: [customer, store, deliverer, code], buttonUrlSuffix: track } }
          : { name: 'order_out_for_delivery_no_code', params: { body: [customer, store, deliverer], buttonUrlSuffix: track } }
      case 'ARRIVING':
        return requireDeliveryCode
          ? { name: 'order_arriving', params: { body: [customer, store, code] } }
          : { name: 'order_arriving_no_code', params: { body: [customer, store] } }
      case 'DELIVERED':
        return { name: 'order_delivered', params: { body: [customer, store, address] } }
      case 'CANCELLED':
        return { name: 'order_cancelled', params: { body: [customer, store] } }
      case 'ADDRESS_CHANGED':
        return { name: 'order_address_updated', params: { body: [customer, store, address], buttonUrlSuffix: track } }
      default:
        return null
    }
  })()

  return selected ? { ...selected, lang: WA_TEMPLATE_LANG } : null
}

async function start() {
  const app            = buildApp()
  app.log.info({ buildTime }, '[boot] version')
  const whatsapp       = createCloudApiProvider(db, app.log)
  const messageLogRepo = createPgMessageLogRepo(db)
  const orderRepo      = createPgOrderRepo(db)
  const autoRouteRepo  = createPgAutoRouteRepo(db)
  const pushProvider   = createFcmProvider()
  const deviceTokenRepo = createPgDeviceTokenRepo(db)

  // Remove tokens que o FCM rejeitou por não existirem mais (app desinstalado/
  // rotacionado). Evita que tokens mortos se acumulem e sejam reenviados sempre.
  const pruneInvalidTokens = async (invalidTokens: string[]) => {
    if (invalidTokens.length === 0) return
    try {
      await deviceTokenRepo.deleteMany(invalidTokens)
      app.log.info({ count: invalidTokens.length }, '[push] pruned invalid tokens')
    } catch (err) {
      app.log.error({ err }, '[push] failed to prune invalid tokens')
    }
  }

  // ── Notification worker ──────────────────────────────────────────────────
  const notificationWorker = createNotificationWorker(async (job) => {
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
        const { successCount, failureCount, invalidTokens } = await pushProvider.send(tokens, payload)
        app.log.info({ storeId, successCount, failureCount }, '[push] pickup_reminder FCM result')
        await pruneInvalidTokens(invalidTokens)
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
        const { successCount, failureCount, invalidTokens } = await pushProvider.send(tokens, payload)
        app.log.info({ storeId, delivererId, successCount, failureCount }, '[push] route_done_waiting FCM result')
        await pruneInvalidTokens(invalidTokens)
      } catch (err) {
        app.log.error({ err, storeId, delivererId }, '[push] route_done_waiting FCM send error')
      }
      return
    }

    // ── Push notification ──
    if (job.data.type === 'push') {
      const { delivererId, orderId, storeId, statusEvent } = job.data
      app.log.info({ orderId, storeId, delivererId, statusEvent }, '[push] job received')

      // Entregador OFFLINE não deve receber push (ex.: force-offline com
      // pedido ativo, ou status mudou entre o evento e o processamento do job).
      if (delivererId) {
        const { rows: [d] } = await db.query<{ status: string }>(
          'SELECT status FROM deliverers WHERE id = $1',
          [delivererId]
        )
        if (!d || d.status === 'OFFLINE') {
          app.log.info({ orderId, storeId, delivererId }, '[push] deliverer offline — skipping')
          return
        }
      }

      const tokens = delivererId
        ? await deviceTokenRepo.findByDeliverer(delivererId)
        : await deviceTokenRepo.findByStore(storeId)
      app.log.info({ orderId, storeId, tokenCount: tokens.length }, '[push] tokens found')
      if (tokens.length === 0) {
        app.log.warn({ orderId, storeId }, '[push] no tokens — skipping')
        return
      }

      // Eventos sem pedido (ex.: AUTO_ROUTE_NEXT) não carregam orderId.
      let customerName = ''
      if (orderId) {
        const order = await orderRepo.findById(orderId, storeId)
        if (!order) {
          app.log.warn({ orderId, storeId }, '[push] order not found — skipping')
          return
        }
        customerName = order.customer.name
      }

      const payload = buildPushPayload(statusEvent, orderId, customerName)
      app.log.info({ orderId, storeId, title: payload.title }, '[push] sending to FCM')
      try {
        const { successCount, failureCount, invalidTokens } = await pushProvider.send(tokens, payload)
        app.log.info({ orderId, storeId, successCount, failureCount }, '[push] FCM result')
        if (failureCount > 0) {
          app.log.warn({ orderId, storeId, failureCount }, '[push] some FCM tokens failed')
        }
        await pruneInvalidTokens(invalidTokens)
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
    if (feat.length === 0) {
      app.log.error({ orderId, storeId, statusEvent }, '[whatsapp] NOT sent — store does not have the whatsapp feature enabled')
      return
    }

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
    if (!enabledStatuses.includes(statusEvent)) {
      app.log.error({ orderId, storeId, statusEvent, enabledStatuses }, '[whatsapp] NOT sent — status not in store notify list')
      return
    }

    const order = await orderRepo.findById(orderId, storeId)
    if (!order) {
      app.log.error({ orderId, storeId, statusEvent }, '[whatsapp] NOT sent — order not found')
      return
    }

    const phone = order.customer.phone
    if (!phone) {
      app.log.error({ orderId, storeId, statusEvent }, '[whatsapp] NOT sent — customer has no phone')
      return
    }

    // Confirmação por código na entrega — quando off, não expomos o código na msg.
    const { rows: [codeCfg] } = await db.query(
      `SELECT COALESCE(ssv.value, s.default_value) AS value
       FROM settings s
       LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
       WHERE s.name = 'require_delivery_code'`,
      [storeId]
    )
    const requireDeliveryCode = (codeCfg as { value?: string } | undefined)?.value !== 'false'

    // Nome da loja — vai no corpo do template (o número é central da LogiFlow, o
    // cliente precisa reconhecer de qual loja é a mensagem).
    const { rows: [storeRow] } = await db.query('SELECT name FROM stores WHERE id = $1', [storeId])
    const storeName = (storeRow as { name?: string } | undefined)?.name ?? ''

    // Seleciona o template aprovado + parâmetros para este status.
    const template = buildStatusTemplate(statusEvent, {
      customerName:        order.customer.name,
      storeName,
      delivererName:       order.deliverer?.name,
      deliveryCode:        order.deliveryCode,
      deliveryAddress:     order.customer.address,
      orderId,
      requireDeliveryCode,
    })
    if (!template) {
      app.log.error({ orderId, storeId, statusEvent }, '[whatsapp] NOT sent — status sem template mapeado')
      return
    }

    // Texto legível salvo em message_logs (histórico do painel / _order-messages).
    const trackingUrl = `${process.env.TRACKING_BASE_URL ?? 'https://logiflow-beige.vercel.app/rastreio'}/${orderId}`
    const message = buildStatusMessage(
      statusEvent,
      order.customer.name,
      trackingUrl,
      order.deliveryCode,
      order.customer.address,
      order.deliverer?.name,
      requireDeliveryCode,
    )

    const logId = await messageLogRepo.log({ storeId, orderId, phone, message })
    try {
      const waId = await whatsapp.sendTemplate(storeId, phone, template.name, template.lang, template.params)
      await messageLogRepo.markSent(logId, waId)
      app.log.warn({ orderId, storeId, statusEvent, phone, waId, template: template.name }, '[whatsapp] sent')
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      await messageLogRepo.markFailed(logId, reason)
      app.log.error({ err, orderId, storeId, statusEvent, phone, template: template.name }, '[whatsapp] NOT sent — sendTemplate threw')
    }
  })

  // ── Location worker ──────────────────────────────────────────────────────
  // Grava/deduplica o ping de GPS e detecta chegada fora do caminho da
  // requisição; roda no mesmo processo, então o broadcast ao mapa (wsHub, em
  // memória) sai daqui, com o mesmo gating de antes (só quando o ponto é salvo).
  const trackingRepo   = createPgTrackingRepo(db)
  const locationWorker = createLocationWorker(async (job) => {
    const { delivererId, storeId, lat, lng, recordedAt } = job.data
    const saved = await trackingRepo.recordLocation(delivererId, lat, lng, new Date(recordedAt))
    if (saved) wsHub.broadcastDelivererLocation(storeId, delivererId, lat, lng)
  })
  locationWorker.on('failed', (job, err) =>
    app.log.error({ err, delivererId: job?.data.delivererId }, '[location] job failed'))

  // ── Reconnect previously active WhatsApp sessions ────────────────────────
  whatsapp.reconnectAll().catch((err) => app.log.warn({ err }, 'WhatsApp reconnect failed'))

  // ── WebSocket heartbeat ──────────────────────────────────────────────────
  startHeartbeat()

  // ── Delay scanner: alerta pedidos em rota parados há muito tempo, e pedidos
  //    prioritários cujo horário máximo de entrega estourou ──────────────────
  const runDelayScan = () => {
    scanDelayedOrders({ orderRepo, notificationQueue, log: app.log })
      .catch((err) => app.log.error({ err }, '[delay-scan] unexpected error'))
    scanPriorityOverdue({ orderRepo, notificationQueue, log: app.log })
      .catch((err) => app.log.error({ err }, '[priority-scan] unexpected error'))
    scanAutoRoutes({ autoRouteRepo, orderRepo, notificationQueue, log: app.log })
      .catch((err) => app.log.error({ err }, '[auto-route] unexpected error'))
  }
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

  // A poda de location_history roda num service separado de workers (mesmo
  // codebase/imagem): runner em `src/jobs/worker.ts` + registro em
  // `src/jobs/registry.ts`, rodado via `npm run worker` no EasyPanel.

  // ── Shutdown gracioso ──────────────────────────────────────────────────────
  // Deploy/restart: para de aceitar requests, deixa o job em voo terminar e para
  // de puxar novos. Jobs ainda na fila sobrevivem no Redis e são reprocessados.
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, '[shutdown] draining…')
    try {
      await app.close()                 // fecha o HTTP server (sem novos requests)
      await notificationWorker.close()  // deixa o job atual terminar; para de pegar novos
      await locationWorker.close()      // idem para os pings de localização
    } catch (err) {
      app.log.error({ err }, '[shutdown] error while draining')
    } finally {
      process.exit(0)
    }
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT',  () => void shutdown('SIGINT'))

  // ── HTTP server ──────────────────────────────────────────────────────────
  const port = Number(process.env.PORT ?? 3001)
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`LogiFlow backend running on http://0.0.0.0:${port}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
