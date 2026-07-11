import Fastify from 'fastify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { locationQueue } from './shared/infra/queue'
import { db } from './shared/db/client'
import { authRoutes } from './modules/auth/interface/routes'
import { orderRoutes } from './modules/orders/interface/routes'
import { customerRoutes } from './modules/customers/interface/routes'
import { assistanceRoutes } from './modules/assistances/interface/routes'
import { delivererRoutes } from './modules/deliverers/interface/routes'
import { trackingRoutes } from './modules/tracking/interface/routes'
import { notificationRoutes } from './modules/notifications/interface/routes'
import { whatsappWebhookRoutes } from './modules/notifications/interface/webhook-routes'
import { settingsRoutes } from './modules/settings/interface/routes'
import { routeRoutes } from './modules/routes/interface/routes'
import { autoRouteRoutes } from './modules/auto-routes/interface/routes'
import { superAdminRoutes } from './modules/super-admin/interface/routes'
import { analyticsRoutes } from './modules/analytics/interface/routes'
import { goalRoutes } from './modules/goals/interface/routes'
import { gamificationRoutes } from './modules/gamification/interface/routes'
import { sessionRoutes } from './modules/sessions/interface/routes'
import { announcementRoutes } from './modules/announcements/interface/routes'
import { garantiaRoutes } from './modules/garantias/interface/routes'
import { chatRoutes } from './modules/chat/interface/routes'
import { wsHub } from './shared/infra/websocket'
import { notificationQueue } from './shared/infra/queue'
import { addCorrelationId, noticeError, recordCustomEvent } from './shared/infra/observability'

// Versão do build (gerada em dist/version.json pelo `npm run build`). Lida uma
// vez no carregamento do módulo; em dev (tsx, sem version.json) cai no fallback.
const startedAt = new Date().toISOString()
let buildTime = 'dev'
try {
  buildTime = (JSON.parse(readFileSync(join(__dirname, 'version.json'), 'utf8')) as { buildTime: string }).buildTime
} catch { /* sem version.json em dev — mantém 'dev' */ }

export { buildTime }

export function buildApp() {
  const app = Fastify({
    // Render (e proxies em geral) ficam à frente do app: confiar no
    // x-forwarded-for para que req.ip seja o IP real do cliente.
    trustProxy: true,
    // Usa o Correlation-Id do cliente (mobile) como id do request. Assim TODOS
    // os logs daquele request no stdout carregam `correlationId: and-1.1.1-5.say5d`.
    // Sem o header (ex.: web), o Fastify gera um id próprio.
    requestIdHeader: 'correlation-id',
    requestIdLogLabel: 'correlationId',
    logger: {
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  })

  // Encaminha o Correlation-Id para o New Relic (custom attribute consultável
  // em NRQL). req.id já é o header do cliente ou um id gerado pelo Fastify.
  app.addHook('onRequest', async (req) => {
    addCorrelationId(String(req.id))
  })

  // Requests cujo erro já foi tratado pelo onError (erros lançados), para o
  // onResponse não logar duas vezes a mesma falha.
  const handledErrors = new WeakSet<object>()

  // Erros LANÇADOS (throw / reply.send(err) / validação / 500 inesperado):
  // loga o stack completo no stdout (correlacionado pelo correlationId) e
  // reporta ao New Relic com a mensagem + stack reais (não o genérico "HttpError").
  app.addHook('onError', async (req, _reply, err) => {
    handledErrors.add(req)
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500
    const route = req.routeOptions?.url ?? req.url
    const payload = { err, statusCode, route, method: req.method }
    if (statusCode >= 500) req.log.error(payload, '[error] request failed')
    else req.log.warn(payload, '[error] request rejected')
    noticeError(err, {
      correlationId: String(req.id),
      statusCode,
      method: req.method,
      route,
    })
  })

  // Respostas de erro montadas à mão (ex.: reply.code(409).send({ error })) não
  // passam pelo onError. No onSend temos o corpo, então conseguimos extrair a
  // mensagem real e dar visibilidade a TODAS as respostas 4xx/5xx: log no stdout
  // + evento agregável no New Relic. NRQL:
  //   SELECT * FROM HttpErrorResponse WHERE statusCode = 409 SINCE 1 day ago
  app.addHook('onSend', async (req, reply, payload) => {
    const statusCode = reply.statusCode
    if (statusCode < 400) return payload

    let message = ''
    if (typeof payload === 'string' && payload.length > 0) {
      try {
        const body = JSON.parse(payload) as { error?: unknown; message?: unknown }
        message = String(body.error ?? body.message ?? '')
      } catch {
        message = payload.slice(0, 200)
      }
    }
    const route = req.routeOptions?.url ?? req.url

    // onError já logou (com stack) os erros lançados; aqui evitamos duplicar e
    // cobrimos as respostas de erro construídas manualmente.
    if (!handledErrors.has(req)) {
      req.log.warn(
        { statusCode, route, method: req.method, error: message },
        '[response] error status',
      )
    }
    recordCustomEvent('HttpErrorResponse', {
      correlationId: String(req.id),
      statusCode,
      method: req.method,
      route,
      message,
    })
    return payload
  })

  const corsOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean) ?? []

  // Allow local dev frontends (localhost, 127.0.0.1 and private LAN IPs) to hit
  // this backend regardless of FRONTEND_URL, so a local dev server can target
  // the deployed API without CORS errors.
  const isLocalOrigin = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)

  app.register(cors, {
    origin(origin, cb) {
      if (corsOrigins.length === 0 || !origin || corsOrigins.includes(origin) || isLocalOrigin(origin)) {
        cb(null, true)   // reflect the Origin header — works with credentials
        return
      }
      // Log para diagnóstico: se requests falham por CORS (e não por cold start),
      // a origem rejeitada aparece aqui. Silêncio = não é CORS.
      app.log.warn({ origin, allowed: corsOrigins }, 'CORS rejected origin')
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials:    true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tracking-Code', 'Correlation-Id'],
    methods:        ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'logiflow-dev-secret',
    sign:   { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
  })

  // Fastify 5 rejects Content-Type: application/json with empty body by default.
  // Clients (Dio, fetch) send that header on DELETE requests with no body, so we
  // replace the built-in parser with one that treats an empty body as {}.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    // Guarda o corpo cru p/ validar a assinatura do webhook do WhatsApp (HMAC).
    ;(req as unknown as { rawBody?: string }).rawBody = body as string
    if (!body || (body as string).length === 0) {
      done(null, {})
      return
    }
    try {
      done(null, JSON.parse(body as string))
    } catch (err) {
      done(err as Error, undefined)
    }
  })

  app.register(websocket)

  // WebSocket hub — autenticado via ?token=<jwt>
  app.register(async (wsApp) => {
    wsApp.get('/ws', { websocket: true }, (socket, req) => {
      const { token } = req.query as Record<string, string>

      if (!token) {
        socket.close(1008, 'Missing token')
        return
      }

      try {
        const payload = app.jwt.verify<{
          type: string; sub: string; storeId: string; name: string; role?: string
        }>(token)

        wsHub.register({
          storeId:     payload.storeId,
          delivererId: payload.type === 'deliverer' ? payload.sub : undefined,
          ws:          socket,
          onClose:     payload.type === 'deliverer' ? async () => {
            // Release this deliverer's pending reservations and notify others
            const { rows } = await db.query(
              `UPDATE orders SET reserved_by = NULL, reserved_at = NULL
               WHERE reserved_by = $1 RETURNING id`,
              [payload.sub]
            )
            for (const row of rows) {
              wsHub.broadcastOrderReservation(payload.storeId, row.id as string, null)
            }
          } : undefined,
        })

        // Deliverer app sends location via WebSocket every ~15s. Só enfileira;
        // o worker de localização grava/deduplica e faz o broadcast ao mapa.
        if (payload.type === 'deliverer') {
          socket.on('message', async (raw: Buffer) => {
            try {
              const msg = JSON.parse(raw.toString()) as { event: string; data: Record<string, unknown> }
              if (msg.event === 'location') {
                await locationQueue.add('point', {
                  delivererId: payload.sub,
                  storeId:     payload.storeId,
                  lat:         msg.data.lat as number,
                  lng:         msg.data.lng as number,
                  recordedAt:  new Date().toISOString(),
                })
              }
            } catch (_) {}
          })
        }
      } catch {
        socket.close(1008, 'Invalid token')
      }
    })
  })

  // Routes
  app.register(authRoutes)
  app.register(orderRoutes)
  app.register(customerRoutes)
  app.register(assistanceRoutes)
  app.register(delivererRoutes)
  app.register(trackingRoutes)
  app.register(notificationRoutes)
  app.register(whatsappWebhookRoutes)
  app.register(settingsRoutes)
  app.register(routeRoutes)
  app.register(autoRouteRoutes)
  app.register(superAdminRoutes)
  app.register(analyticsRoutes)
  app.register(goalRoutes)
  app.register(gamificationRoutes)
  app.register(sessionRoutes)
  app.register(announcementRoutes)
  app.register(garantiaRoutes)
  app.register(chatRoutes)

  // As checagens do /health são caras (3 round-trips ao Postgres remoto + fila).
  // Throttle rígido: computa no máximo 1× a cada janela e serve o snapshot em cache
  // para o resto; requisições concorrentes coalescem num único cálculo (single-flight).
  // Assim, sob probe frequente ou flood, o banco vê no máximo 1 checagem por janela.
  const HEALTH_TTL_MS = 10_000
  type HealthResult = { status: number; body: Record<string, unknown> }
  let healthCache:    { at: number; result: HealthResult } | null = null
  let healthInFlight: Promise<HealthResult> | null = null

  const computeHealth = async (): Promise<HealthResult> => {
    const round = (n: number) => Math.round(n * 10) / 10

    // Postgres: conectividade + latência média (3 amostras sequenciais de SELECT 1).
    const samples: number[] = []
    let pgConnected = true
    let pgError: string | undefined
    try {
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now()
        await db.query('SELECT 1')
        samples.push(performance.now() - t0)
      }
    } catch (err) {
      pgConnected = false
      pgError = (err as Error).message
    }
    const avgLatencyMs = samples.length
      ? round(samples.reduce((a, b) => a + b, 0) / samples.length)
      : null

    // Fila de notificações (BullMQ): contagem por estado.
    let queue: Record<string, number> | { error: string }
    try {
      queue = await notificationQueue.getJobCounts(
        'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
      )
    } catch (err) {
      queue = { error: (err as Error).message }
    }

    return {
      status: pgConnected ? 200 : 503,
      body: {
        status: pgConnected ? 'ok' : 'degraded',
        postgres: {
          connected:    pgConnected,
          avgLatencyMs,
          samplesMs:    samples.map(round),
          pool:         db.poolStats(),
          ...(pgError ? { error: pgError } : {}),
        },
        queue,
      },
    }
  }

  app.get('/health', async (_req, reply) => {
    const now = Date.now()

    // Dentro da janela → devolve o cache sem tocar no banco.
    if (healthCache && now - healthCache.at < HEALTH_TTL_MS) {
      reply.code(healthCache.result.status)
      return { ...healthCache.result.body, cached: true, ageMs: now - healthCache.at }
    }

    // Fora da janela → recalcula uma vez; concorrentes esperam o mesmo cálculo.
    if (!healthInFlight) {
      healthInFlight = computeHealth()
        .then((result) => { healthCache = { at: Date.now(), result }; return result })
        .finally(() => { healthInFlight = null })
    }
    const result = await healthInFlight
    reply.code(result.status)
    return { ...result.body, cached: false }
  })

  // Confirma qual build está no ar: buildTime muda a cada deploy novo;
  // startedAt/uptimeSec indicam quando o container subiu pela última vez.
  app.get('/version', async () => ({
    buildTime,
    startedAt,
    uptimeSec: Math.round(process.uptime()),
  }))

  return app
}
