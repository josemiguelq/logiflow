import { FastifyRequest, FastifyReply } from 'fastify'
import { db } from '../db/client'
import { redis } from '../infra/redis'
import { addActorContext } from '../infra/observability'

export type JWTPayload =
  | { type: 'store_user'; sub: string; storeId: string; role: string; name: string; scopes: string[]; jti?: string }
  | { type: 'deliverer';  sub: string; storeId: string; name: string }
  | { type: 'super_admin'; sub: string; email: string }

declare module 'fastify' {
  interface FastifyRequest {
    actor: {
      type:     'store_user' | 'deliverer' | 'super_admin'
      sub:      string
      storeId:  string
      name:     string
      role?:    string
      email?:   string
      scopes?:  string[]
      jti?:     string
    }
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req.actor = req.user as any
    addActorContext(req.actor)
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }

  // Sessões do operador: denylist (revogação) + atualização de last_seen (throttle).
  // Tudo best-effort/fail-open — se o Redis cair, não bloqueia o uso.
  const actor = req.actor
  if (actor.type === 'store_user' && actor.jti) {
    try {
      if (await redis.exists(`revoked:${actor.jti}`)) {
        reply.code(401).send({ error: 'SESSION_REVOKED' })
        return
      }
    } catch { /* fail-open */ }
    try {
      const set = await redis.set(`seen:${actor.jti}`, '1', 'EX', 60, 'NX')
      if (set === 'OK') {
        db.query(`UPDATE store_user_sessions SET last_seen_at = now() WHERE id = $1`, [actor.jti])
          .catch(() => { /* non-fatal */ })
      }
    } catch { /* non-fatal */ }
  }
}

export async function requireStoreUser(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.actor.type !== 'store_user') {
    reply.code(403).send({ error: 'Forbidden' })
  }
}

export async function requireDeliverer(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.actor.type !== 'deliverer') {
    return reply.code(403).send({ error: 'Forbidden' })
  }
  const { rows: [d] } = await db.query(
    'SELECT is_active, deleted_at FROM deliverers WHERE id = $1',
    [req.actor.sub]
  )
  if (!d || d.deleted_at || !d.is_active) {
    return reply.code(401).send({ error: 'ACCOUNT_DISABLED' })
  }
}

export async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.actor.type !== 'super_admin') {
    reply.code(403).send({ error: 'Forbidden' })
  }
}
