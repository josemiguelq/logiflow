import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireRole } from '../../../shared/middleware/rbac'

export async function analyticsRoutes(app: FastifyInstance) {
  const guard = [requireStoreUser, requireRole('MANAGER')]

  // GET /analytics/orders/timeseries?scale=day|month
  app.get('/analytics/orders/timeseries', { preHandler: guard }, async (req) => {
    const { scale } = z.object({
      scale: z.enum(['day', 'month']).default('day'),
    }).parse(req.query)

    const storeId = req.actor.storeId

    if (scale === 'day') {
      // Last 30 days
      const { rows } = await db.query(
        `SELECT
           TO_CHAR(gs.day::date, 'YYYY-MM-DD') AS date,
           COALESCE(cnt.count, 0)::int          AS count
         FROM generate_series(
           (now() - INTERVAL '29 days')::date,
           now()::date,
           '1 day'::interval
         ) AS gs(day)
         LEFT JOIN (
           SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS day,
                  COUNT(*) AS count
           FROM orders
           WHERE store_id = $1
           GROUP BY 1
         ) cnt ON cnt.day = gs.day
         ORDER BY gs.day ASC`,
        [storeId]
      )
      return rows
    }

    // Last 12 months
    const { rows } = await db.query(
      `SELECT
         TO_CHAR(gs.month::date, 'YYYY-MM') AS date,
         COALESCE(cnt.count, 0)::int         AS count
       FROM generate_series(
         DATE_TRUNC('month', now() - INTERVAL '11 months'),
         DATE_TRUNC('month', now()),
         '1 month'::interval
       ) AS gs(month)
       LEFT JOIN (
         SELECT DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') AS month,
                COUNT(*) AS count
         FROM orders
         WHERE store_id = $1
         GROUP BY 1
       ) cnt ON cnt.month = gs.month
       ORDER BY gs.month ASC`,
      [storeId]
    )
    return rows
  })

  // GET /analytics/orders/by-status
  app.get('/analytics/orders/by-status', { preHandler: guard }, async (req) => {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1
       GROUP BY status`,
      [req.actor.storeId]
    )

    const base: Record<string, number> = {
      PREPARING: 0, ASSIGNED: 0, ON_ROUTE: 0,
      OUT_FOR_DELIVERY: 0, DELIVERED: 0, CANCELLED: 0,
    }
    for (const r of rows as { status: string; count: number }[]) {
      base[r.status] = r.count
    }
    return base
  })

  // GET /analytics/deliverers/summary
  app.get('/analytics/deliverers/summary', { preHandler: guard }, async (req) => {
    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM deliverers
       WHERE store_id = $1 AND is_active = true
       GROUP BY status`,
      [req.actor.storeId]
    )

    const summary: Record<string, number> = { AVAILABLE: 0, ON_ROUTE: 0, OFFLINE: 0 }
    for (const r of rows as { status: string; count: number }[]) {
      summary[r.status] = r.count
    }
    return {
      available: summary['AVAILABLE']!,
      onRoute:   summary['ON_ROUTE']!,
      offline:   summary['OFFLINE']!,
      total:     summary['AVAILABLE']! + summary['ON_ROUTE']! + summary['OFFLINE']!,
    }
  })
}
