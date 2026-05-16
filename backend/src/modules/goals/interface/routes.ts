import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'

const GOAL_TYPE   = z.enum(['deliveries', 'avg_rating', 'cancellation_rate', 'avg_delivery_time'])
const GOAL_PERIOD = z.enum(['daily', 'weekly', 'monthly'])

function periodStart(period: 'daily' | 'weekly' | 'monthly'): string {
  return {
    daily:   `date_trunc('day',   now())`,
    weekly:  `date_trunc('week',  now())`,
    monthly: `date_trunc('month', now())`,
  }[period]
}

async function calcProgress(
  delivererId: string,
  storeId: string,
  type: string,
  period: 'daily' | 'weekly' | 'monthly',
): Promise<number | null> {
  const since = periodStart(period)

  if (type === 'deliveries') {
    const { rows } = await db.query(
      `SELECT COUNT(*) AS val FROM orders
       WHERE deliverer_id = $1 AND store_id = $2 AND status = 'DELIVERED'
         AND delivered_at >= ${since}`,
      [delivererId, storeId]
    )
    return Number(rows[0]?.val ?? 0)
  }

  if (type === 'avg_rating') {
    const { rows } = await db.query(
      `SELECT ROUND(AVG(rating)::NUMERIC, 2) AS val FROM orders
       WHERE deliverer_id = $1 AND store_id = $2 AND status = 'DELIVERED'
         AND rating IS NOT NULL AND delivered_at >= ${since}`,
      [delivererId, storeId]
    )
    return rows[0]?.val != null ? Number(rows[0].val) : null
  }

  if (type === 'cancellation_rate') {
    const { rows } = await db.query(
      `SELECT
         ROUND(
           100.0 * COUNT(*) FILTER (WHERE status = 'CANCELLED') /
           NULLIF(COUNT(*) FILTER (WHERE status IN ('DELIVERED','CANCELLED')), 0)
         , 1) AS val
       FROM orders
       WHERE deliverer_id = $1 AND store_id = $2
         AND created_at >= ${since}`,
      [delivererId, storeId]
    )
    return rows[0]?.val != null ? Number(rows[0].val) : null
  }

  if (type === 'avg_delivery_time') {
    const { rows } = await db.query(
      `SELECT ROUND(
         AVG(EXTRACT(EPOCH FROM (delivered_at - COALESCE(picked_up_at, created_at))) / 60)
       ::NUMERIC, 1) AS val
       FROM orders
       WHERE deliverer_id = $1 AND store_id = $2 AND status = 'DELIVERED'
         AND delivered_at IS NOT NULL AND delivered_at >= ${since}`,
      [delivererId, storeId]
    )
    return rows[0]?.val != null ? Number(rows[0].val) : null
  }

  return null
}

export async function goalRoutes(app: FastifyInstance) {
  const viewGuard   = [requireStoreUser, requireScope('goals:view')]
  const manageGuard = [requireStoreUser, requireScope('goals:manage')]

  // GET /goals/deliverers — all deliverers + their goals + current progress
  app.get('/goals/deliverers', { preHandler: viewGuard }, async (req) => {
    const storeId = req.actor.storeId

    const { rows: deliverers } = await db.query(
      `SELECT id, name, username, status FROM deliverers
       WHERE store_id = $1 AND is_active = true ORDER BY name`,
      [storeId]
    )

    const { rows: goals } = await db.query(
      `SELECT id, deliverer_id, type, target, period FROM deliverer_goals
       WHERE store_id = $1`,
      [storeId]
    )

    const result = await Promise.all(deliverers.map(async (d) => {
      const delivererGoals = goals.filter((g) => g.deliverer_id === d.id)
      const goalsWithProgress = await Promise.all(
        delivererGoals.map(async (g) => ({
          id:       g.id as string,
          type:     g.type as string,
          target:   Number(g.target),
          period:   g.period as string,
          progress: await calcProgress(d.id as string, storeId, g.type as string, g.period as 'daily' | 'weekly' | 'monthly'),
        }))
      )
      return {
        id:       d.id as string,
        name:     d.name as string,
        username: d.username as string,
        status:   d.status as string,
        goals:    goalsWithProgress,
      }
    }))

    return result
  })

  // PUT /goals/deliverers/:delivererId — upsert one goal
  app.put('/goals/deliverers/:delivererId', { preHandler: manageGuard }, async (req, reply) => {
    const { delivererId } = req.params as { delivererId: string }
    const storeId         = req.actor.storeId

    const body = z.object({
      type:   GOAL_TYPE,
      target: z.number().positive(),
      period: GOAL_PERIOD,
    }).parse(req.body)

    const { rows: [d] } = await db.query(
      'SELECT id FROM deliverers WHERE id = $1 AND store_id = $2',
      [delivererId, storeId]
    )
    if (!d) return reply.code(404).send({ error: 'Entregador não encontrado' })

    const { rows: [goal] } = await db.query(
      `INSERT INTO deliverer_goals (store_id, deliverer_id, type, target, period)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (store_id, deliverer_id, type, period)
       DO UPDATE SET target = EXCLUDED.target
       RETURNING *`,
      [storeId, delivererId, body.type, body.target, body.period]
    )

    return {
      id:       goal.id as string,
      type:     goal.type as string,
      target:   Number(goal.target),
      period:   goal.period as string,
      progress: await calcProgress(delivererId, storeId, body.type, body.period),
    }
  })

  // DELETE /goals/:goalId — remove a goal
  app.delete('/goals/:goalId', { preHandler: manageGuard }, async (req, reply) => {
    const { goalId } = req.params as { goalId: string }
    const storeId    = req.actor.storeId

    const { rowCount } = await db.query(
      'DELETE FROM deliverer_goals WHERE id = $1 AND store_id = $2',
      [goalId, storeId]
    )
    if (!rowCount) return reply.code(404).send({ error: 'Meta não encontrada' })
    return reply.code(204).send()
  })
}
