import Fastify from 'fastify'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
import { createPgTrackingRepo } from './modules/tracking/infrastructure/repositories/pg-tracking-repo'
import { db } from './shared/db/client'
import { authRoutes } from './modules/auth/interface/routes'
import { orderRoutes } from './modules/orders/interface/routes'
import { customerRoutes } from './modules/customers/interface/routes'
import { delivererRoutes } from './modules/deliverers/interface/routes'
import { trackingRoutes } from './modules/tracking/interface/routes'
import { notificationRoutes } from './modules/notifications/interface/routes'
import { settingsRoutes } from './modules/settings/interface/routes'
import { routeRoutes } from './modules/routes/interface/routes'
import { superAdminRoutes } from './modules/super-admin/interface/routes'
import { analyticsRoutes } from './modules/analytics/interface/routes'
import { goalRoutes } from './modules/goals/interface/routes'
import { gamificationRoutes } from './modules/gamification/interface/routes'
import { sessionRoutes } from './modules/sessions/interface/routes'
import { wsHub } from './shared/infra/websocket'

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
    logger: {
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
    },
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tracking-Code'],
    methods:        ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'logiflow-dev-secret',
    sign:   { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
  })

  // Fastify 5 rejects Content-Type: application/json with empty body by default.
  // Clients (Dio, fetch) send that header on DELETE requests with no body, so we
  // replace the built-in parser with one that treats an empty body as {}.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
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

        // Deliverer app sends location via WebSocket every ~15s
        if (payload.type === 'deliverer') {
          const trackingRepo = createPgTrackingRepo(db)
          socket.on('message', async (raw: Buffer) => {
            try {
              const msg = JSON.parse(raw.toString()) as { event: string; data: Record<string, unknown> }
              if (msg.event === 'location') {
                const lat = msg.data.lat as number
                const lng = msg.data.lng as number
                const saved = await trackingRepo.recordLocation(payload.sub, lat, lng)
                if (saved) wsHub.broadcastDelivererLocation(payload.storeId, payload.sub, lat, lng)
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
  app.register(delivererRoutes)
  app.register(trackingRoutes)
  app.register(notificationRoutes)
  app.register(settingsRoutes)
  app.register(routeRoutes)
  app.register(superAdminRoutes)
  app.register(analyticsRoutes)
  app.register(goalRoutes)
  app.register(gamificationRoutes)
  app.register(sessionRoutes)

  app.get('/health', async (_req, reply) => {
    return reply.type('text/plain').send('ok')
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
