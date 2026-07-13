import { DB } from '../../../../shared/db/client'
import { DeliveryRoute, RouteStatus, RouteWithDetails, RouteOrderItem, RouteLogEntry, RouteIssue } from '../../domain/entities'
import { isDeliveredOffTarget } from '../../../../shared/utils/geo'

function mapRoute(r: Record<string, unknown>): DeliveryRoute {
  return {
    id:          r.id as string,
    storeId:     r.store_id as string,
    delivererId: r.deliverer_id as string,
    pickupCode:  r.pickup_code as string,
    status:      r.status as RouteStatus,
    createdAt:   r.created_at as Date,
    startedAt:   r.started_at as Date | undefined,
    finishedAt:  r.finished_at as Date | undefined,
  }
}

const LIST_JOIN = `
  SELECT r.*,
    d.name     AS deliverer_name,
    d.username AS deliverer_username,
    COUNT(o.id) AS order_count
  FROM routes r
  JOIN deliverers d   ON d.id = r.deliverer_id
  LEFT JOIN orders o  ON o.route_id = r.id
`

export function createPgRouteRepo(db: DB) {
  // Anexa uma entrada ao log JSONB da rota (mesmo padrão de orders.appendLog).
  const appendLog = async (routeId: string, entry: RouteLogEntry): Promise<void> => {
    await db.query(
      `UPDATE routes SET log = COALESCE(log, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
      [routeId, JSON.stringify([entry])]
    )
  }

  // Anexa um problema reportado pelo entregador ao array JSONB issues da rota.
  const appendIssue = async (routeId: string, issue: RouteIssue): Promise<void> => {
    await db.query(
      `UPDATE routes SET issues = COALESCE(issues, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
      [routeId, JSON.stringify([issue])]
    )
  }

  return {
    appendLog,
    appendIssue,

    async findByStore(
      storeId: string,
      page = 1,
      limit = 15,
      filters: { delivererId?: string; from?: string; to?: string } = {}
    ): Promise<{ items: RouteWithDetails[]; total: number }> {
      const offset = (page - 1) * limit

      // Dynamic filters, parametrized — same pattern as /routes/export.
      const params: unknown[] = [storeId]
      const conds: string[] = ['r.store_id = $1']
      if (filters.delivererId) { params.push(filters.delivererId); conds.push(`r.deliverer_id = $${params.length}`) }
      if (filters.from)        { params.push(filters.from);        conds.push(`r.created_at >= $${params.length}::date`) }
      if (filters.to)          { params.push(filters.to);          conds.push(`r.created_at <  ($${params.length}::date + interval '1 day')`) }

      params.push(limit)
      const limitIdx = params.length
      params.push(offset)
      const offsetIdx = params.length

      const { rows } = await db.query(
        `SELECT sub.*, COUNT(*) OVER() AS total_count
         FROM (
           ${LIST_JOIN}
           WHERE ${conds.join(' AND ')}
           GROUP BY r.id, d.name, d.username
           ORDER BY r.created_at DESC
         ) sub
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      )
      const total = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count) : 0
      return {
        items: rows.map(r => ({
          ...mapRoute(r as Record<string, unknown>),
          orderCount: Number((r as Record<string, unknown>).order_count ?? 0),
          deliverer: {
            id:       (r as Record<string, unknown>).deliverer_id as string,
            name:     (r as Record<string, unknown>).deliverer_name as string,
            username: (r as Record<string, unknown>).deliverer_username as string,
          },
          orders: [],
          log: [],   // listagem fica leve; o log completo só vem no detalhe
          issues: [],
        })),
        total,
      }
    },

    async findById(id: string, storeId: string): Promise<RouteWithDetails | null> {
      const { rows: rrows } = await db.query(
        `${LIST_JOIN}
         WHERE r.id = $1 AND r.store_id = $2
         GROUP BY r.id, d.name, d.username`,
        [id, storeId]
      )
      if (!rrows[0]) return null
      const r = rrows[0] as Record<string, unknown>

      const { rows: orows } = await db.query(
        `SELECT o.id,
                c.name                                        AS customer_name,
                o.delivery_address                           AS customer_address,
                o.delivery_code,
                o.status,
                o.route_position,
                o.created_at,
                o.picked_up_at,
                o.arrived_at,
                o.delivered_at,
                COALESCE(o.delivery_lat, ca.lat)             AS target_lat,
                COALESCE(o.delivery_lng, ca.lng)             AS target_lng,
                pf.lat                                        AS proof_lat,
                pf.lng                                        AS proof_lng
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN customer_addresses ca ON ca.customer_id = o.customer_id AND ca.is_default = true
         LEFT JOIN LATERAL (
           SELECT p.lat, p.lng FROM proof_of_delivery p
           WHERE p.order_id = o.id AND p.lat IS NOT NULL AND p.lng IS NOT NULL
           ORDER BY p.photo_index ASC, p.created_at ASC LIMIT 1
         ) pf ON true
         WHERE o.route_id = $1
         ORDER BY o.route_position ASC NULLS LAST, o.created_at ASC`,
        [id]
      )

      return {
        ...mapRoute(r),
        orderCount: Number(r.order_count ?? 0),
        log: (r.log as RouteLogEntry[] | null) ?? [],
        issues: (r.issues as RouteIssue[] | null) ?? [],
        deliverer: {
          id:       r.deliverer_id as string,
          name:     r.deliverer_name as string,
          username: r.deliverer_username as string,
        },
        orders: orows.map(o => ({
          id:              (o as Record<string, unknown>).id as string,
          customerName:    (o as Record<string, unknown>).customer_name as string,
          customerAddress: (o as Record<string, unknown>).customer_address as string,
          deliveryCode:    (o as Record<string, unknown>).delivery_code as string,
          status:          (o as Record<string, unknown>).status as string,
          routePosition:   (o as Record<string, unknown>).route_position as number | undefined,
          createdAt:       (o as Record<string, unknown>).created_at as Date | undefined,
          pickedUpAt:      (o as Record<string, unknown>).picked_up_at as Date | undefined,
          arrivedAt:       (o as Record<string, unknown>).arrived_at as Date | undefined,
          deliveredAt:     (o as Record<string, unknown>).delivered_at as Date | undefined,
          deliveredOffTarget:
            ((o as Record<string, unknown>).status === 'DELIVERED') &&
            isDeliveredOffTarget(
              (o as Record<string, unknown>).target_lat as number | null,
              (o as Record<string, unknown>).target_lng as number | null,
              (o as Record<string, unknown>).proof_lat  as number | null,
              (o as Record<string, unknown>).proof_lng  as number | null,
            ),
        } as RouteOrderItem)),
      }
    },

    async findByDeliverer(delivererId: string): Promise<RouteWithDetails[]> {
      const { rows } = await db.query(
        `${LIST_JOIN}
         WHERE r.deliverer_id = $1 AND r.status IN ('CREATED','STARTED')
         GROUP BY r.id, d.name, d.username
         HAVING COUNT(o.id) > 0
         ORDER BY r.created_at DESC`,
        [delivererId]
      )
      return rows.map(r => ({
        ...mapRoute(r as Record<string, unknown>),
        orderCount: Number((r as Record<string, unknown>).order_count ?? 0),
        deliverer: {
          id:       (r as Record<string, unknown>).deliverer_id as string,
          name:     (r as Record<string, unknown>).deliverer_name as string,
          username: (r as Record<string, unknown>).deliverer_username as string,
        },
        orders: [],
        log: [],
        issues: [],
      }))
    },

    async create(data: { storeId: string; delivererId: string; pickupCode: string }): Promise<DeliveryRoute> {
      const { rows } = await db.query(
        `INSERT INTO routes (store_id, deliverer_id, pickup_code)
         VALUES ($1,$2,$3) RETURNING *`,
        [data.storeId, data.delivererId, data.pickupCode]
      )
      return mapRoute(rows[0] as Record<string, unknown>)
    },

    async linkOrders(routeId: string, orderIds: string[]): Promise<void> {
      if (!orderIds.length) return
      await db.query(
        `UPDATE orders SET route_id = $1 WHERE id = ANY($2::uuid[])`,
        [routeId, orderIds]
      )
    },

    async updateStatus(id: string, storeId: string, status: RouteStatus): Promise<DeliveryRoute | null> {
      const sets: string[]    = ['status = $3']
      const params: unknown[] = [id, storeId, status]
      let idx = 4

      if (status === 'STARTED') {
        sets.push(`started_at = COALESCE(started_at, $${idx++})`)
        params.push(new Date())
      }
      if (status === 'FINISHED') {
        sets.push(`finished_at = COALESCE(finished_at, $${idx++})`)
        params.push(new Date())
      }

      const { rows } = await db.query(
        `UPDATE routes SET ${sets.join(', ')}
         WHERE id = $1 AND store_id = $2 RETURNING *`,
        params
      )
      return rows[0] ? mapRoute(rows[0] as Record<string, unknown>) : null
    },

    async checkAndFinish(routeId: string, storeId: string): Promise<boolean> {
      const { rows } = await db.query(
        `SELECT
           COUNT(*)                                                      AS total,
           COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED')) AS pending
         FROM orders WHERE route_id = $1`,
        [routeId]
      )
      const total   = Number((rows[0] as Record<string, unknown>)?.total ?? 0)
      const pending = Number((rows[0] as Record<string, unknown>)?.pending ?? 0)
      if (pending > 0) return false

      const { rowCount } = await db.query(
        `UPDATE routes
         SET status = 'FINISHED', finished_at = COALESCE(finished_at, now())
         WHERE id = $1 AND store_id = $2 AND status != 'FINISHED'`,
        [routeId, storeId]
      )
      // Registra a finalização automática só quando ESTA chamada efetivou a mudança.
      if (rowCount) {
        await appendLog(routeId, {
          at:     new Date().toISOString(),
          by:     { type: 'system' },
          action: 'FINISHED',
          details: { trigger: total === 0 ? 'auto_empty' : 'auto_all_done' },
        }).catch(() => { /* non-fatal */ })
      }
      return true
    },
  }
}
