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

  // GET /analytics/idle-time?days=14
  // Por dia: tempo ocioso dos entregadores (AVAILABLE sem rota) x espera média
  // dos pedidos (created_at→picked_up_at). O cruzamento evita falso positivo de
  // um dia tranquilo: ocioso só conta como "desperdício" quando havia demanda
  // esperando (espera acima do limiar saudável da loja).
  app.get('/analytics/idle-time', { preHandler: guard }, async (req) => {
    const { days } = z.object({
      days: z.coerce.number().int().min(1).max(90).default(14),
    }).parse(req.query)
    const storeId = req.actor.storeId

    // Limiar "saudável" de espera (min) — reusa o limiar vermelho de preparo.
    const { rows: [refRow] } = await db.query(
      `SELECT COALESCE(ssv.value, s.default_value) AS value
       FROM settings s
       LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
       WHERE s.name = 'delay_prep_red_min'`,
      [storeId]
    )
    const referenceLagMin = parseInt((refRow as { value?: string } | undefined)?.value ?? '30', 10) || 30

    // Tempo ocioso por dia: soma da sobreposição dos segmentos AVAILABLE de cada
    // entregador com cada dia. Segmentos abertos são fechados em now() e limitados
    // a 10h para não inflar caso o app não registre OFFLINE.
    const { rows: idleRows } = await db.query(
      `WITH segs AS (
         SELECT status, changed_at AS s,
           LEAST(
             COALESCE(LEAD(changed_at) OVER (PARTITION BY deliverer_id ORDER BY changed_at), now()),
             changed_at + interval '10 hours'
           ) AS e
         FROM deliverer_status_history
         WHERE store_id = $1
       ),
       days AS (
         SELECT generate_series((now()::date - ($2::int - 1)), now()::date, interval '1 day')::date AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
         COALESCE(SUM(
           EXTRACT(EPOCH FROM (
             LEAST(segs.e, (d.day + interval '1 day')) - GREATEST(segs.s, d.day::timestamptz)
           ))
         ), 0) / 60.0 AS idle_minutes
       FROM days d
       LEFT JOIN segs
         ON segs.status = 'AVAILABLE'
        AND segs.e > d.day::timestamptz
        AND segs.s < (d.day + interval '1 day')
       GROUP BY d.day
       ORDER BY d.day`,
      [storeId, days]
    )

    // Espera média (created→picked_up) dos pedidos retirados em cada dia.
    const { rows: lagRows } = await db.query(
      `SELECT to_char(date_trunc('day', picked_up_at), 'YYYY-MM-DD') AS date,
              AVG(EXTRACT(EPOCH FROM (picked_up_at - created_at))) / 60.0 AS avg_lag_minutes,
              COUNT(*)::int AS picked_count
       FROM orders
       WHERE store_id = $1 AND picked_up_at IS NOT NULL
         AND picked_up_at >= (now()::date - ($2::int - 1))
       GROUP BY 1`,
      [storeId, days]
    )
    const lagByDate = new Map(
      (lagRows as { date: string; avg_lag_minutes: string; picked_count: number }[])
        .map(r => [r.date, { avgLag: Number(r.avg_lag_minutes), picked: r.picked_count }])
    )

    const series = (idleRows as { date: string; idle_minutes: string }[]).map(r => {
      const idleMinutes = Math.round(Number(r.idle_minutes))
      const lag = lagByDate.get(r.date)
      const avgPickupLagMinutes = lag ? Math.round(lag.avgLag) : 0
      const pickedCount = lag?.picked ?? 0
      // Fator de pressão: 0 quando a espera está saudável, cresce até 1 conforme
      // a espera passa do limiar. Ocioso só "pesa" quando havia fila esperando.
      const pressure = Math.max(0, Math.min(1, (avgPickupLagMinutes - referenceLagMin) / referenceLagMin))
      const wastedCapacityMinutes = Math.round(idleMinutes * pressure)
      return { date: r.date, idleMinutes, avgPickupLagMinutes, pickedCount, wastedCapacityMinutes }
    })

    const totalWasted = series.reduce((a, s) => a + s.wastedCapacityMinutes, 0)
    const totalIdle   = series.reduce((a, s) => a + s.idleMinutes, 0)
    return { referenceLagMin, totalIdleMinutes: totalIdle, totalWastedMinutes: totalWasted, series }
  })
}
