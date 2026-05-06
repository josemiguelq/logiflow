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
import { wsHub } from './shared/infra/websocket'

export function buildApp() {
  const app = Fastify({
    logger: {
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
    },
  })

  // Em desenvolvimento, refletimos sempre a origem (evita CORS ao misturar localhost /
  // 127.0.0.1 ou porta diferente da lista). Em produção (ou CORS_STRICT=1), usa FRONTEND_URL.
  const strictCors =
    process.env.NODE_ENV === 'production' || process.env.CORS_STRICT === '1'

  const corsOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean)

  let corsOrigin: boolean | string | string[]
  if (!strictCors) {
    corsOrigin = true
  } else if (corsOrigins && corsOrigins.length > 0) {
    corsOrigin = corsOrigins.length === 1 ? corsOrigins[0]! : corsOrigins
  } else {
    corsOrigin = true
  }

  if (strictCors && corsOrigin === true) {
    console.warn(
      '[cors] FRONTEND_URL não definido: aceitando qualquer origem (refletida). Defina FRONTEND_URL em produção.'
    )
  }

  app.register(cors, {
    origin:          corsOrigin,
    credentials:     true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods:         ['GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? 'logiflow-dev-secret',
    sign:   { expiresIn: process.env.JWT_EXPIRES_IN ?? '7d' },
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
        })

        // Deliverer app sends location via WebSocket every ~15s
        if (payload.type === 'deliverer') {
          const trackingRepo = createPgTrackingRepo(db)
          socket.on('message', async (raw: Buffer) => {
            try {
              const msg = JSON.parse(raw.toString()) as { event: string; data: Record<string, unknown> }
              if (msg.event === 'location') {
                const lat     = msg.data.lat     as number
                const lng     = msg.data.lng     as number
                const orderId = msg.data.orderId as string | undefined
                const saved = await trackingRepo.recordLocation(payload.sub, orderId ?? null, lat, lng)
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

  app.get('/health', async (_req, reply) => {
    return reply.type('text/plain').send('ok')
  })

  return app
}
