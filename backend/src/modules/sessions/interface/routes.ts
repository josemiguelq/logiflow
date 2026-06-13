import { FastifyInstance } from 'fastify'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'

const WEEK_SEC = 7 * 24 * 60 * 60

// Revoga uma sessão: entra na denylist do Redis (TTL ~ vida do token) e marca
// revoked_at no banco (histórico/exibição).
async function revokeJti(jti: string, ttlSec: number) {
  try { await redis.set(`revoked:${jti}`, '1', 'EX', Math.max(60, Math.floor(ttlSec))) } catch { /* non-fatal */ }
  await db.query(
    `UPDATE store_user_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [jti]
  ).catch(() => { /* non-fatal */ })
}

interface SessionRow {
  id: string; ip: string | null; user_agent: string | null
  created_at: Date; last_seen_at: Date; revoked_at: Date | null
}

function mapSession(r: SessionRow, currentJti?: string) {
  const active = r.revoked_at == null && (Date.now() - new Date(r.last_seen_at).getTime()) < 15 * 60 * 1000
  return {
    id:         r.id,
    ip:         r.ip,
    userAgent:  r.user_agent,
    createdAt:  r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt:  r.revoked_at,
    active,
    current:    r.id === currentJti,
  }
}

export async function sessionRoutes(app: FastifyInstance) {
  // Logout: revoga a própria sessão atual.
  app.post('/auth/store/logout', { preHandler: requireStoreUser }, async (req) => {
    const jti = req.actor.jti
    if (jti) {
      const exp = (req.user as { exp?: number }).exp
      const ttl = exp ? exp - Math.floor(Date.now() / 1000) : WEEK_SEC
      await revokeJti(jti, ttl)
    }
    return { ok: true }
  })

  // Minhas sessões + último login.
  app.get('/store/me/sessions', { preHandler: requireStoreUser }, async (req) => {
    const [{ rows: [u] }, { rows }] = await Promise.all([
      db.query('SELECT last_login_at FROM store_users WHERE id = $1', [req.actor.sub]),
      db.query(
        `SELECT id, ip, user_agent, created_at, last_seen_at, revoked_at
         FROM store_user_sessions
         WHERE store_user_id = $1 AND created_at > now() - interval '30 days'
         ORDER BY last_seen_at DESC`,
        [req.actor.sub]
      ),
    ])
    return {
      lastLoginAt: (u as { last_login_at?: Date } | undefined)?.last_login_at ?? null,
      sessions: (rows as SessionRow[]).map(r => mapSession(r, req.actor.jti)),
    }
  })

  // Revoga uma sessão por id. Própria sempre; de outro usuário exige scope.
  app.post('/store/sessions/:id/revoke', { preHandler: requireStoreUser }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { rows: [s] } = await db.query(
      'SELECT store_user_id, store_id FROM store_user_sessions WHERE id = $1', [id]
    )
    if (!s || (s as { store_id: string }).store_id !== req.actor.storeId) {
      return reply.code(404).send({ error: 'Sessão não encontrada' })
    }
    if ((s as { store_user_id: string }).store_user_id !== req.actor.sub
        && !(req.actor.scopes ?? []).includes('sessions:view_all')) {
      return reply.code(403).send({ error: 'Insufficient permissions' })
    }
    await revokeJti(id, WEEK_SEC)
    return { ok: true }
  })

  // Sessões de todos os usuários da loja (gated por scope).
  app.get(
    '/store/sessions/all',
    { preHandler: [requireStoreUser, requireScope('sessions:view_all')] },
    async (req) => {
      const { rows } = await db.query(
        `SELECT u.id AS user_id, u.name, u.email, u.role, u.last_login_at,
                s.id, s.ip, s.user_agent, s.created_at, s.last_seen_at, s.revoked_at
         FROM store_users u
         LEFT JOIN store_user_sessions s
           ON s.store_user_id = u.id AND s.created_at > now() - interval '30 days'
         WHERE u.store_id = $1
         ORDER BY u.name ASC, s.last_seen_at DESC`,
        [req.actor.storeId]
      )

      type Row = SessionRow & {
        user_id: string; name: string; email: string; role: string; last_login_at: Date | null
      }
      const byUser = new Map<string, {
        user: { id: string; name: string; email: string; role: string }
        lastLoginAt: Date | null
        sessions: ReturnType<typeof mapSession>[]
      }>()
      for (const r of rows as Row[]) {
        if (!byUser.has(r.user_id)) {
          byUser.set(r.user_id, {
            user: { id: r.user_id, name: r.name, email: r.email, role: r.role },
            lastLoginAt: r.last_login_at,
            sessions: [],
          })
        }
        if (r.id) byUser.get(r.user_id)!.sessions.push(mapSession(r))
      }

      return [...byUser.values()].map(u => ({
        ...u,
        activeCount: u.sessions.filter(s => s.active).length,
      }))
    }
  )
}
