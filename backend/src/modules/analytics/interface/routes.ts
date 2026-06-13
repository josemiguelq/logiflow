import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'

// Duration buckets só mudam quando entregas são concluídas; 6h de staleness é
// aceitável para o analítico. Chave inclui o storeId → isolamento por loja.
const DURATION_BUCKETS_TTL = 6 * 60 * 60 // 6h em segundos

export async function analyticsRoutes(app: FastifyInstance) {
  const guard = [requireStoreUser, requireScope('analytics:view')]

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

  // GET /analytics/orders/created-by-halfhour?days=7
  // Pedidos CRIADOS agrupados por faixa de 30 min do dia (48 slots), uma série
  // por dia — para comparar os últimos N dias e ver os horários de pico.
  app.get('/analytics/orders/created-by-halfhour', { preHandler: guard }, async (req) => {
    const { days } = z.object({
      days: z.coerce.number().int().min(1).max(31).default(7),
    }).parse(req.query)
    const storeId = req.actor.storeId
    const TZ = 'America/Sao_Paulo'

    // Lista dos N dias (mais antigo → mais recente), inclusive sem pedidos.
    const { rows: dayRows } = await db.query(
      `SELECT to_char(d, 'YYYY-MM-DD') AS day
       FROM generate_series(
         ((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1)),
         (now() AT TIME ZONE '${TZ}')::date,
         interval '1 day') d
       ORDER BY d`,
      [days]
    )
    const dayList = (dayRows as { day: string }[]).map(r => r.day)

    const { rows: countRows } = await db.query(
      `SELECT
         to_char((created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS day,
         (EXTRACT(HOUR FROM (created_at AT TIME ZONE '${TZ}'))::int * 2
           + FLOOR(EXTRACT(MINUTE FROM (created_at AT TIME ZONE '${TZ}')) / 30)::int) AS slot,
         COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1
         AND (created_at AT TIME ZONE '${TZ}')::date >= ((now() AT TIME ZONE '${TZ}')::date - ($2::int - 1))
       GROUP BY 1, 2`,
      [storeId, days]
    )
    const countMap = new Map<string, number>()
    for (const r of countRows as { day: string; slot: number; count: number }[]) {
      countMap.set(`${r.day}|${r.slot}`, r.count)
    }

    const slotLabel = (s: number) =>
      `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 === 0 ? '00' : '30'}`

    const rows: Record<string, string | number>[] = []
    for (let s = 0; s < 48; s++) {
      const row: Record<string, string | number> = { slot: slotLabel(s) }
      for (const day of dayList) row[day] = countMap.get(`${day}|${s}`) ?? 0
      rows.push(row)
    }

    return { days: dayList, rows }
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

  // GET /analytics/cancellations/by-reason?period=today|7d|30d
  // Agrupa cancelamentos por código de motivo, para visibilidade dos erros de
  // operação. Cancelamentos antigos (sem código) caem em 'LEGACY'.
  app.get('/analytics/cancellations/by-reason', { preHandler: guard }, async (req) => {
    const { period } = z.object({
      period: z.enum(['today', '7d', '30d']).default('30d'),
    }).parse(req.query)

    const interval = period === 'today' ? '0 days' : period === '7d' ? '6 days' : '29 days'

    const { rows } = await db.query(
      `SELECT COALESCE(cancel_reason, 'LEGACY') AS code, COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1 AND status = 'CANCELLED'
         AND cancelled_at >= DATE_TRUNC('day', now()) - $2::interval
       GROUP BY code
       ORDER BY count DESC`,
      [req.actor.storeId, interval]
    )

    const base: Record<string, number> = { MISSING_ITEM: 0, WRONG_ORDER: 0, OTHER: 0, LEGACY: 0 }
    for (const r of rows as { code: string; count: number }[]) {
      base[r.code] = r.count
    }
    return base
  })

  // GET /analytics/orders/averages?period=today|7d|30d
  app.get('/analytics/orders/averages', { preHandler: guard }, async (req) => {
    const { period } = z.object({
      period: z.enum(['today', '7d', '30d']).default('30d'),
    }).parse(req.query)

    const interval = period === 'today' ? '0 days' : period === '7d' ? '6 days' : '29 days'

    const { rows: [row] } = await db.query(
      `SELECT
         ROUND(AVG(per_deliverer.cnt)::numeric, 1) AS avg_per_deliverer,
         ROUND(AVG(per_route.cnt)::numeric,     1) AS avg_per_route
       FROM
         (SELECT deliverer_id, COUNT(*) AS cnt
          FROM orders
          WHERE store_id = $1 AND status = 'DELIVERED'
            AND deliverer_id IS NOT NULL
            AND created_at >= DATE_TRUNC('day', now()) - $2::interval
          GROUP BY deliverer_id) AS per_deliverer
         FULL OUTER JOIN
         (SELECT route_id, COUNT(*) AS cnt
          FROM orders
          WHERE store_id = $1 AND route_id IS NOT NULL
            AND created_at >= DATE_TRUNC('day', now()) - $2::interval
          GROUP BY route_id) AS per_route
         ON false`,
      [req.actor.storeId, interval]
    )
    return {
      avgOrdersPerDeliverer: row ? Number(row.avg_per_deliverer) || 0 : 0,
      avgOrdersPerRoute:     row ? Number(row.avg_per_route)     || 0 : 0,
    }
  })

  // GET /analytics/deliverers/delivered-counts?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/analytics/deliverers/delivered-counts', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query)

    const { rows } = await db.query(
      `SELECT d.name, COUNT(o.id)::int AS delivered
       FROM deliverers d
       JOIN orders o ON o.deliverer_id = d.id
       WHERE o.store_id      = $1
         AND o.status        = 'DELIVERED'
         AND o.delivered_at >= $2::date
         AND o.delivered_at <  $3::date + INTERVAL '1 day'
       GROUP BY d.id, d.name
       ORDER BY delivered DESC`,
      [req.actor.storeId, from, to]
    )
    return rows.map((r: Record<string, unknown>) => ({
      name:      r.name as string,
      delivered: r.delivered as number,
    }))
  })

  // GET /analytics/orders/durations?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/analytics/orders/durations', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query)

    const { rows: [row] } = await db.query(
      `SELECT
         ROUND(AVG(EXTRACT(EPOCH FROM (picked_up_at - created_at)) / 60)::numeric, 1)  AS avg_prep_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 60)::numeric, 1) AS avg_route_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (delivered_at - created_at)) / 60)::numeric, 1)  AS avg_total_min,
         COUNT(*)::int AS count
       FROM orders
       WHERE store_id      = $1
         AND status        = 'DELIVERED'
         AND picked_up_at IS NOT NULL
         AND delivered_at IS NOT NULL
         AND delivered_at >= $2::date
         AND delivered_at <  $3::date + INTERVAL '1 day'`,
      [req.actor.storeId, from, to]
    )
    return {
      avgPrepMin:   row ? Number(row.avg_prep_min)   || 0 : 0,
      avgRouteMin:  row ? Number(row.avg_route_min)  || 0 : 0,
      avgTotalMin:  row ? Number(row.avg_total_min)  || 0 : 0,
      count:        row ? Number(row.count)          || 0 : 0,
    }
  })

  // GET /analytics/orders/duration-buckets?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/analytics/orders/duration-buckets', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query)

    const storeId = req.actor.storeId
    const cacheKey = `analytics:duration-buckets:store:${storeId}:${from}:${to}`
    try {
      const cached = await redis.get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch { /* fall through to DB */ }

    const { rows } = await db.query(
      `SELECT
         TO_CHAR(gs.day::date, 'YYYY-MM-DD') AS date,
         COALESCE(SUM((o.prep_min  IS NOT NULL AND o.prep_min  <  30)::int), 0)::int AS prep_lt30,
         COALESCE(SUM((o.prep_min  >= 30 AND o.prep_min  < 45)::int), 0)::int        AS prep_30to45,
         COALESCE(SUM((o.prep_min  >= 45)::int), 0)::int                             AS prep_gt45,
         COALESCE(SUM((o.route_min IS NOT NULL AND o.route_min <  30)::int), 0)::int AS route_lt30,
         COALESCE(SUM((o.route_min >= 30 AND o.route_min < 45)::int), 0)::int        AS route_30to45,
         COALESCE(SUM((o.route_min >= 45)::int), 0)::int                             AS route_gt45
       FROM generate_series($2::date, $3::date, '1 day'::interval) AS gs(day)
       LEFT JOIN (
         SELECT
           DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')        AS day,
           EXTRACT(EPOCH FROM (picked_up_at - created_at))  / 60   AS prep_min,
           EXTRACT(EPOCH FROM (delivered_at - picked_up_at)) / 60  AS route_min
         FROM orders
         WHERE store_id = $1
           AND status = 'DELIVERED'
           AND created_at >= $2::date
           AND created_at <  $3::date + INTERVAL '1 day'
       ) o ON o.day = DATE_TRUNC('day', gs.day AT TIME ZONE 'UTC')
       GROUP BY gs.day
       ORDER BY gs.day ASC`,
      [storeId, from, to]
    )

    const result = rows.map((r: Record<string, unknown>) => ({
      date:        r.date as string,
      prepLt30:    r.prep_lt30 as number,
      prep30to45:  r.prep_30to45 as number,
      prepGt45:    r.prep_gt45 as number,
      routeLt30:   r.route_lt30 as number,
      route30to45: r.route_30to45 as number,
      routeGt45:   r.route_gt45 as number,
    }))

    redis.setex(cacheKey, DURATION_BUCKETS_TTL, JSON.stringify(result)).catch(() => {})
    return result
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

  // GET /analytics/orders/pickup-wait?days=14
  // Série temporal do tempo de espera até a retirada (created_at→picked_up_at),
  // por dia (bucketizado pela data de criação do pedido): média e p95 em minutos.
  // O p95 expõe a cauda — poucos pedidos muito demorados que a média esconde.
  app.get('/analytics/orders/pickup-wait', { preHandler: guard }, async (req) => {
    const { days } = z.object({
      days: z.coerce.number().int().min(1).max(90).default(14),
    }).parse(req.query)

    const { rows } = await db.query(
      `SELECT
         to_char(d.day, 'YYYY-MM-DD') AS date,
         COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (o.picked_up_at - o.created_at))) / 60.0)::numeric, 1), 0) AS avg_min,
         COALESCE(ROUND((percentile_cont(0.95) WITHIN GROUP (
                    ORDER BY EXTRACT(EPOCH FROM (o.picked_up_at - o.created_at))) / 60.0)::numeric, 1), 0) AS p95_min,
         COUNT(o.id)::int AS count
       FROM generate_series((now()::date - ($2::int - 1)), now()::date, interval '1 day') AS d(day)
       LEFT JOIN orders o
         ON o.created_at::date = d.day::date
        AND o.store_id = $1
        AND o.picked_up_at IS NOT NULL
       GROUP BY d.day
       ORDER BY d.day`,
      [req.actor.storeId, days]
    )

    return (rows as { date: string; avg_min: string; p95_min: string; count: number }[]).map(r => ({
      date:   r.date,
      avgMin: Number(r.avg_min),
      p95Min: Number(r.p95_min),
      count:  r.count,
    }))
  })
}
