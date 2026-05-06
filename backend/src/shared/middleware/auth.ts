import { FastifyRequest, FastifyReply } from 'fastify'

export type JWTPayload =
  | { type: 'store_user'; sub: string; storeId: string; role: string; name: string }
  | { type: 'deliverer';  sub: string; storeId: string; name: string }
  | { type: 'super_admin'; sub: string; email: string }

declare module 'fastify' {
  interface FastifyRequest {
    actor: JWTPayload
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify()
    req.actor = req.user as JWTPayload
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
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
    reply.code(403).send({ error: 'Forbidden' })
  }
}

export async function requireSuperAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (reply.sent) return
  if (req.actor.type !== 'super_admin') {
    reply.code(403).send({ error: 'Forbidden' })
  }
}
