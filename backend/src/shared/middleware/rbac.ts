import { FastifyRequest, FastifyReply } from 'fastify'

type Role = 'OWNER' | 'MANAGER' | 'ASSISTANT'

const hierarchy: Record<Role, number> = {
  OWNER:     3,
  MANAGER:   2,
  ASSISTANT: 1,
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const actor = req.actor
    if (!actor || actor.type !== 'store_user') {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    const actorLevel = hierarchy[actor.role as Role] ?? 0
    const minRequired = Math.min(...roles.map((r) => hierarchy[r]))
    if (actorLevel < minRequired) {
      return reply.code(403).send({ error: 'Insufficient permissions' })
    }
  }
}
