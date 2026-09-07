import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { redis } from '../../../shared/infra/redis'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'

// Duration buckets só mudam quando entregas são concluídas; 6h de staleness é
// aceitável para o analítico. Chave inclui o storeId → isolamento por loja.
const DURATION_BUCKETS_TTL = 6 * 60 * 60 // 6h em segundos

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// Schema comum a todo endpoint que aceita um período atual (from/to) e,
// opcionalmente, um período de comparação — os dois campos de comparação são
// tudo-ou-nada (o dashboard sempre envia o par junto, ou nenhum dos dois).
// Mantido como ZodObject "base" (sem o .refine ainda aplicado) para permitir
// `.extend(...)` nos endpoints que somam campos próprios (scale, mode).
const rangeWithCompareBase = z.object({
  from: dateStr,
  to: dateStr,
  compareFrom: dateStr.optional(),
  compareTo: dateStr.optional(),
})
const compareRefine = <T extends { compareFrom?: string; compareTo?: string }>(d: T) =>
  (d.compareFrom == null) === (d.compareTo == null)
const compareRefineOpts = { message: 'compareFrom e compareTo devem ser enviados juntos' }

const rangeWithCompareSchema = rangeWithCompareBase.refine(compareRefine, compareRefineOpts)

const slotLabel = (s: number) =>
  `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 === 0 ? '00' : '30'}`

export async function analyticsRoutes(app: FastifyInstance) {
  const guard = [requireStoreUser, requireScope('analytics:view')]

  // GET /analytics/kpis?from&to&compareFrom&compareTo
  // KPIs do dashboard executivo, todos calculados sobre pedidos CRIADOS no
  // período (created_at) — inclusive "entregues"/"cancelados"/"em rota", que
  // aqui significam "dos pedidos criados no período, quantos estão hoje nesse
  // status", não "cujo evento de status caiu no período". Essa definição única
  // é o que mantém os números do card e da sparkline sempre consistentes.
  app.get('/analytics/kpis', { preHandler: guard }, async (req) => {
    const { from, to, compareFrom, compareTo } = rangeWithCompareSchema.parse(req.query)
    const storeId = req.actor.storeId

    // SUM((condição)::int) em vez de COUNT(*) FILTER (WHERE ...) — mesmo padrão
    // já usado em /analytics/orders/duration-buckets, evitando qualquer dúvida
    // sobre precedência de FILTER + cast encadeados.
    const totalsSql = `
      SELECT
        COUNT(*)::int                                                             AS orders,
        COALESCE(SUM((status = 'DELIVERED')::int), 0)::int                        AS delivered,
        COALESCE(SUM((status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY'))::int), 0)::int  AS on_route,
        COALESCE(SUM((status = 'CANCELLED')::int), 0)::int                        AS cancelled,
        COUNT(DISTINCT customer_id)::int                                          AS active_customers,
        COUNT(DISTINCT deliverer_id)::int                                         AS active_deliverers
      FROM orders
      WHERE store_id = $1 AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'`

    const sparklineSql = `
      SELECT
        TO_CHAR(gs.day::date, 'YYYY-MM-DD') AS date,
        COALESCE(COUNT(o.id), 0)::int                                                      AS orders,
        COALESCE(SUM((o.status = 'DELIVERED')::int), 0)::int                               AS delivered,
        COALESCE(SUM((o.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY'))::int), 0)::int          AS on_route,
        COALESCE(SUM((o.status = 'CANCELLED')::int), 0)::int                               AS cancelled,
        COALESCE(COUNT(DISTINCT o.customer_id), 0)::int                                     AS active_customers,
        COALESCE(COUNT(DISTINCT o.deliverer_id), 0)::int                                    AS active_deliverers
      FROM generate_series($2::date, $3::date, '1 day'::interval) AS gs(day)
      LEFT JOIN orders o
        ON DATE_TRUNC('day', o.created_at AT TIME ZONE 'UTC') = gs.day
       AND o.store_id = $1
      GROUP BY gs.day
      ORDER BY gs.day ASC`

    type Totals = {
      orders: number; delivered: number; on_route: number; cancelled: number
      active_customers: number; active_deliverers: number
    }
    const toTotals = (row: Totals | undefined) => ({
      orders:           row?.orders ?? 0,
      delivered:        row?.delivered ?? 0,
      onRoute:          row?.on_route ?? 0,
      cancelled:        row?.cancelled ?? 0,
      activeCustomers:  row?.active_customers ?? 0,
      activeDeliverers: row?.active_deliverers ?? 0,
    })

    const [{ rows: [currentRow] }, { rows: sparkRows }] = await Promise.all([
      db.query(totalsSql, [storeId, from, to]),
      db.query(sparklineSql, [storeId, from, to]),
    ])

    let compare: ReturnType<typeof toTotals> | null = null
    if (compareFrom && compareTo) {
      const { rows: [compareRow] } = await db.query(totalsSql, [storeId, compareFrom, compareTo])
      compare = toTotals(compareRow)
    }

    type SparkRow = { date: string } & Totals
    const sparkline = {
      orders:           (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.orders })),
      delivered:        (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.delivered })),
      onRoute:          (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.on_route })),
      cancelled:        (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.cancelled })),
      activeCustomers:  (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.active_customers })),
      activeDeliverers: (sparkRows as SparkRow[]).map(r => ({ date: r.date, count: r.active_deliverers })),
    }

    return { current: toTotals(currentRow), compare, sparkline }
  })

  // GET /analytics/orders/timeseries?from&to&scale=day|month&compareFrom&compareTo
  app.get('/analytics/orders/timeseries', { preHandler: guard }, async (req) => {
    const { from, to, compareFrom, compareTo, scale } = rangeWithCompareBase.extend({
      scale: z.enum(['day', 'month']).default('day'),
    }).refine(compareRefine, compareRefineOpts).parse(req.query)
    const storeId = req.actor.storeId

    async function series(rangeFrom: string, rangeTo: string) {
      if (scale === 'day') {
        const { rows } = await db.query(
          `SELECT
             TO_CHAR(gs.day::date, 'YYYY-MM-DD') AS date,
             COALESCE(cnt.count, 0)::int          AS count
           FROM generate_series($2::date, $3::date, '1 day'::interval) AS gs(day)
           LEFT JOIN (
             SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC') AS day,
                    COUNT(*) AS count
             FROM orders
             WHERE store_id = $1
               AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
             GROUP BY 1
           ) cnt ON cnt.day = gs.day
           ORDER BY gs.day ASC`,
          [storeId, rangeFrom, rangeTo]
        )
        return rows as { date: string; count: number }[]
      }

      const { rows } = await db.query(
        `SELECT
           TO_CHAR(gs.month::date, 'YYYY-MM') AS date,
           COALESCE(cnt.count, 0)::int         AS count
         FROM generate_series(
           DATE_TRUNC('month', $2::date),
           DATE_TRUNC('month', $3::date),
           '1 month'::interval
         ) AS gs(month)
         LEFT JOIN (
           SELECT DATE_TRUNC('month', created_at AT TIME ZONE 'UTC') AS month,
                  COUNT(*) AS count
           FROM orders
           WHERE store_id = $1
             AND created_at >= DATE_TRUNC('month', $2::date)
             AND created_at <  DATE_TRUNC('month', $3::date) + INTERVAL '1 month'
           GROUP BY 1
         ) cnt ON cnt.month = gs.month
         ORDER BY gs.month ASC`,
        [storeId, rangeFrom, rangeTo]
      )
      return rows as { date: string; count: number }[]
    }

    const current = await series(from, to)
    const compare = compareFrom && compareTo ? await series(compareFrom, compareTo) : null
    return { current, compare }
  })

  // GET /analytics/orders/created-by-halfhour?from&to&compareFrom&compareTo
  // Pedidos CRIADOS agrupados por faixa de 30 min do dia (48 slots), somando
  // todos os dias do período — uma série para o período atual e, opcionalmente,
  // uma segunda para o período de comparação (não mais uma linha por dia).
  app.get('/analytics/orders/created-by-halfhour', { preHandler: guard }, async (req) => {
    const { from, to, compareFrom, compareTo } = rangeWithCompareSchema.parse(req.query)
    const storeId = req.actor.storeId
    const TZ = 'America/Sao_Paulo'

    async function distribution(rangeFrom: string, rangeTo: string) {
      const { rows } = await db.query(
        `SELECT
           (EXTRACT(HOUR FROM (created_at AT TIME ZONE '${TZ}'))::int * 2
             + FLOOR(EXTRACT(MINUTE FROM (created_at AT TIME ZONE '${TZ}')) / 30)::int) AS slot,
           COUNT(*)::int AS count
         FROM orders
         WHERE store_id = $1
           AND (created_at AT TIME ZONE '${TZ}')::date >= $2::date
           AND (created_at AT TIME ZONE '${TZ}')::date <= $3::date
         GROUP BY 1`,
        [storeId, rangeFrom, rangeTo]
      )
      const countMap = new Map<number, number>()
      for (const r of rows as { slot: number; count: number }[]) countMap.set(r.slot, r.count)
      return Array.from({ length: 48 }, (_, s) => ({ slot: slotLabel(s), count: countMap.get(s) ?? 0 }))
    }

    const current = await distribution(from, to)
    const compare = compareFrom && compareTo ? await distribution(compareFrom, compareTo) : null
    return { current, compare }
  })

  // GET /analytics/orders/by-status?from&to
  // Sem from/to, mantém o snapshot atual (contagem por status, sem filtro de
  // data) — comportamento anterior preservado para não quebrar nenhum outro
  // consumidor futuro que não passe período.
  app.get('/analytics/orders/by-status', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({
      from: dateStr.optional(),
      to:   dateStr.optional(),
    }).parse(req.query)

    const params: unknown[] = [req.actor.storeId]
    let dateFilter = ''
    if (from && to) {
      params.push(from, to)
      dateFilter = ` AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'`
    }

    const { rows } = await db.query(
      `SELECT status, COUNT(*)::int AS count
       FROM orders
       WHERE store_id = $1${dateFilter}
       GROUP BY status`,
      params
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

  // GET /analytics/cancellations/by-reason?from&to&compareFrom&compareTo
  // Agrupa cancelamentos por código de motivo, para visibilidade dos erros de
  // operação. Cancelamentos antigos (sem código) caem em 'LEGACY'.
  app.get('/analytics/cancellations/by-reason', { preHandler: guard }, async (req) => {
    const { from, to, compareFrom, compareTo } = rangeWithCompareSchema.parse(req.query)
    const storeId = req.actor.storeId

    async function byReason(rangeFrom: string, rangeTo: string) {
      const { rows } = await db.query(
        `SELECT COALESCE(cancel_reason, 'LEGACY') AS code, COUNT(*)::int AS count
         FROM orders
         WHERE store_id = $1 AND status = 'CANCELLED'
           AND cancelled_at >= $2::date AND cancelled_at < $3::date + INTERVAL '1 day'
         GROUP BY code`,
        [storeId, rangeFrom, rangeTo]
      )
      const base: Record<string, number> = { MISSING_ITEM: 0, WRONG_ORDER: 0, OTHER: 0, LEGACY: 0 }
      for (const r of rows as { code: string; count: number }[]) base[r.code] = r.count
      return base
    }

    const current = await byReason(from, to)
    const compare = compareFrom && compareTo ? await byReason(compareFrom, compareTo) : null
    return { current, compare }
  })

  // GET /analytics/orders/averages?from&to
  app.get('/analytics/orders/averages', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({ from: dateStr, to: dateStr }).parse(req.query)

    const { rows: [row] } = await db.query(
      `SELECT
         ROUND(AVG(per_deliverer.cnt)::numeric, 1) AS avg_per_deliverer,
         ROUND(AVG(per_route.cnt)::numeric,     1) AS avg_per_route
       FROM
         (SELECT deliverer_id, COUNT(*) AS cnt
          FROM orders
          WHERE store_id = $1 AND status = 'DELIVERED'
            AND deliverer_id IS NOT NULL
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY deliverer_id) AS per_deliverer
         FULL OUTER JOIN
         (SELECT route_id, COUNT(*) AS cnt
          FROM orders
          WHERE store_id = $1 AND route_id IS NOT NULL
            AND created_at >= $2::date AND created_at < $3::date + INTERVAL '1 day'
          GROUP BY route_id) AS per_route
         ON false`,
      [req.actor.storeId, from, to]
    )
    return {
      avgOrdersPerDeliverer: row ? Number(row.avg_per_deliverer) || 0 : 0,
      avgOrdersPerRoute:     row ? Number(row.avg_per_route)     || 0 : 0,
    }
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

  // GET /analytics/deliverers/performance?from&to
  // Uma linha por entregador com pedidos no período: entregas, cancelamentos,
  // tempo médio de rota e (calculado no frontend) taxa de sucesso. Sem
  // paginação — a tela filtra/ordena/limita no cliente.
  app.get('/analytics/deliverers/performance', { preHandler: guard }, async (req) => {
    const { from, to } = z.object({ from: dateStr, to: dateStr }).parse(req.query)

    const { rows } = await db.query(
      `SELECT
         d.id, d.name,
         COALESCE(SUM((o.status = 'DELIVERED')::int), 0)::int AS delivered,
         COALESCE(SUM((o.status = 'CANCELLED')::int), 0)::int AS cancelled,
         COUNT(*)::int AS total_assigned,
         ROUND(AVG(
           CASE WHEN o.status = 'DELIVERED' AND o.picked_up_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (o.delivered_at - o.picked_up_at)) / 60
           END
         )::numeric, 1) AS avg_route_min
       FROM deliverers d
       JOIN orders o ON o.deliverer_id = d.id
       WHERE o.store_id = $1
         AND o.created_at >= $2::date AND o.created_at < $3::date + INTERVAL '1 day'
       GROUP BY d.id, d.name
       ORDER BY delivered DESC, d.name ASC`,
      [req.actor.storeId, from, to]
    )

    return rows.map((r: Record<string, unknown>) => ({
      id:            r.id as string,
      name:          r.name as string,
      delivered:     r.delivered as number,
      cancelled:     r.cancelled as number,
      totalAssigned: r.total_assigned as number,
      avgRouteMin:   r.avg_route_min != null ? Number(r.avg_route_min) : 0,
    }))
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

  // GET /analytics/customers/order-counts?from&to&compareFrom&compareTo&mode=summary|all
  // mode=summary (default): top 10 e bottom 10 clientes por nº de pedidos no
  // período, com previousCount (nº de pedidos no período de comparação) para
  // calcular crescimento. mode=all: lista completa (sem limite) para o modal
  // "Ver Todos os Clientes".
  app.get('/analytics/customers/order-counts', { preHandler: guard }, async (req) => {
    const { from, to, compareFrom, compareTo, mode } = rangeWithCompareBase.extend({
      mode: z.enum(['summary', 'all']).default('summary'),
    }).refine(compareRefine, compareRefineOpts).parse(req.query)

    const storeId = req.actor.storeId
    const hasCompare = Boolean(compareFrom && compareTo)

    const curSql =
      `SELECT c.id, c.name, COUNT(o.id)::int AS count
       FROM customers c
       JOIN orders o ON o.customer_id = c.id
       WHERE o.store_id = $1
         AND o.created_at >= $2::date
         AND o.created_at <  $3::date + INTERVAL '1 day'
       GROUP BY c.id, c.name`

    const prevSql =
      `SELECT o.customer_id AS id, COUNT(o.id)::int AS count
       FROM orders o
       WHERE o.store_id = $1
         AND o.created_at >= $2::date
         AND o.created_at <  $3::date + INTERVAL '1 day'
       GROUP BY o.customer_id`

    const prevMap = new Map<string, number>()
    if (hasCompare) {
      const { rows: prevRows } = await db.query(prevSql, [storeId, compareFrom, compareTo])
      for (const r of prevRows as { id: string; count: number }[]) prevMap.set(r.id, r.count)
    }

    const withPrevious = (r: { id: string; name: string; count: number }) => ({
      id: r.id,
      name: r.name,
      count: r.count,
      previousCount: hasCompare ? (prevMap.get(r.id) ?? 0) : null,
    })

    if (mode === 'all') {
      const { rows } = await db.query(`${curSql} ORDER BY count DESC, c.name ASC`, [storeId, from, to])
      return { all: (rows as { id: string; name: string; count: number }[]).map(withPrevious) }
    }

    const [{ rows: top }, { rows: bottom }] = await Promise.all([
      db.query(`${curSql} ORDER BY count DESC, c.name ASC LIMIT 10`, [storeId, from, to]),
      db.query(`${curSql} ORDER BY count ASC,  c.name ASC LIMIT 10`, [storeId, from, to]),
    ])

    return {
      top:    (top    as { id: string; name: string; count: number }[]).map(withPrevious),
      bottom: (bottom as { id: string; name: string; count: number }[]).map(withPrevious),
    }
  })
}
