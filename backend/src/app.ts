import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import websocket from '@fastify/websocket'
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

  // Sem FRONTEND_URL em produção, origin virava `false` e o preflight OPTIONS ia para
  // callNotFound() no plugin CORS → 404. Refletir origem quando não houver lista explícita.
  const corsOrigins = process.env.FRONTEND_URL?.split(',').map((o) => o.trim()).filter(Boolean)
  const corsOrigin =
    corsOrigins && corsOrigins.length > 0
      ? corsOrigins.length === 1
        ? corsOrigins[0]
        : corsOrigins
      : true

  if (process.env.NODE_ENV === 'production' && corsOrigin === true) {
    console.warn(
      '[cors] FRONTEND_URL não definido: aceitando qualquer origem (refletida). Defina FRONTEND_URL em produção.'
    )
  }

  app.register(cors, {
    origin:      corsOrigin,
    credentials: true,
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
