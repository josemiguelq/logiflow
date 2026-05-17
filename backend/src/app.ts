import Fastify from 'fastify'
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
import { wsHub } from './shared/infra/websocket'

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  })

  const corsOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean) ?? []

  app.register(cors, {
    origin(origin, cb) {
      if (corsOrigins.length === 0 || !origin || corsOrigins.includes(origin)) {
        cb(null, true)   // reflect the Origin header — works with credentials
        return
      }
      cb(new Error('Not allowed by CORS'), false)
    },
    credentials:    true,
    allowedHeaders: ['Content-Type', 'Authorization'],
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

  app.get('/health', async (_req, reply) => {
    return reply.type('text/plain').send('ok')
  })

  return app
}
