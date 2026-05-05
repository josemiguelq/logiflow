import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { createPgStoreUserRepo } from '../infrastructure/repositories/pg-store-user-repo'
import { createPgDelivererAuthRepo } from '../infrastructure/repositories/pg-deliverer-auth-repo'
import { loginStoreUser } from '../application/use-cases/login-store-user'
import { loginDeliverer } from '../application/use-cases/login-deliverer'

const loginSchema = z.object({
  email:    z.string().email().optional(),
  username: z.string().optional(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  const storeUserRepo   = createPgStoreUserRepo(db)
  const delivererRepo   = createPgDelivererAuthRepo(db)
  const signJwt = (payload: object) => app.jwt.sign(payload as Record<string, unknown>)

  app.post('/auth/store/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    if (!body.email) return reply.code(400).send({ error: 'email required' })
    try {
      const result = await loginStoreUser(
        { email: body.email, password: body.password },
        { storeUserRepo, signJwt }
      )
      return result
    } catch {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
  })

  app.post('/auth/deliverer/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    if (!body.username) return reply.code(400).send({ error: 'username required' })
    try {
      const result = await loginDeliverer(
        { username: body.username, password: body.password },
        { delivererRepo, signJwt }
      )
      return result
    } catch {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }
  })
}
