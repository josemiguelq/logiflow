import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { db } from '../../../shared/db/client'
import { DEFAULT_ROLE_SCOPES } from '../../../shared/scopes'
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

  async function getScopes(storeId: string, role: string): Promise<string[]> {
    const { rows: [row] } = await db.query(
      'SELECT scopes FROM store_role_scopes WHERE store_id = $1 AND role = $2',
      [storeId, role]
    )
    return (row?.scopes as string[] | undefined) ?? DEFAULT_ROLE_SCOPES[role] ?? []
  }

  app.post('/auth/store/login', async (req, reply) => {
    const body = loginSchema.parse(req.body)
    if (!body.email) return reply.code(400).send({ error: 'email required' })
    try {
      const result = await loginStoreUser(
        { email: body.email, password: body.password },
        { storeUserRepo, signJwt, getScopes }
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

  // ── Self-service store registration ───────────────────────────────────────
  const registerSchema = z.object({
    storeName: z.string().min(2),
    ownerName: z.string().min(2),
    email:     z.string().email(),
    password:  z.string().min(6),
  })

  app.post('/auth/register', async (req, reply) => {
    const body = registerSchema.parse(req.body)

    const { rows: [existing] } = await db.query(
      'SELECT id FROM store_users WHERE email = $1',
      [body.email]
    )
    if (existing) return reply.code(409).send({ error: 'E-mail já está em uso' })

    const { rows: [store] } = await db.query(
      `INSERT INTO stores (name, trial_ends_at)
       VALUES ($1, (now() + INTERVAL '3 months')::DATE)
       RETURNING id`,
      [body.storeName]
    )

    for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
      await db.query(
        `INSERT INTO store_role_scopes (store_id, role, scopes)
         VALUES ($1, $2, $3)
         ON CONFLICT (store_id, role) DO NOTHING`,
        [store.id, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])]
      )
    }

    const hash     = await bcrypt.hash(body.password, 10)
    const username = body.email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9_.]/g, '_')
    const { rows: [user] } = await db.query(
      `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'OWNER')
       RETURNING id, name, email, role`,
      [store.id, body.ownerName, body.email, username, hash]
    )

    const scopes = DEFAULT_ROLE_SCOPES['OWNER'] ?? []
    const token  = signJwt({
      type:    'store_user',
      sub:     user.id,
      storeId: store.id,
      role:    'OWNER',
      name:    user.name,
      scopes,
    })

    return reply.code(201).send({
      token,
      user: {
        id:      user.id,
        name:    user.name,
        email:   user.email,
        role:    user.role,
        storeId: store.id,
        scopes,
      },
    })
  })
}
