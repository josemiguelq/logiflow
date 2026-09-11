import { DB } from '../../../../shared/db/client'
import { Order, OrderStatus, OrderWithDetails, OrderLogEntry, OrderSummary } from '../../domain/entities'
import { IOrderRepository, OrderFilters, PublicOrderView, InTransitOrder, PriorityOverdueOrder } from '../../application/ports'
import { isDeliveredOffTarget } from '../../../../shared/utils/geo'

function mapOrderRow(row: Record<string, unknown>): Order {
  return {
    id:              row.id as string,
    storeId:         row.store_id as string,
    delivererId:     row.deliverer_id as string | undefined,
    customerId:      row.customer_id as string,
    createdByUserId: row.created_by_user_id as string,
    status:          row.status as OrderStatus,
    routeId:         row.route_id as string | undefined,
    routePosition:   row.route_position as number | undefined,
    pickupCode:      row.pickup_code as string,
    deliveryCode:    row.delivery_code as string,
    notes:           row.notes as string | undefined,
    isPriority:      (row.is_priority as boolean) ?? false,
    maxDeliveryTime: row.max_delivery_time as Date | undefined,
    thirdPartyDelivery: (row.third_party_delivery as boolean) ?? false,
    agencyId:        row.agency_id as string | undefined,
    agencyName:      row.agency_name as string | undefined,
    agencyAddress:   row.agency_address as string | undefined,
    agencyLat:       row.agency_lat != null ? Number(row.agency_lat) : undefined,
    agencyLng:       row.agency_lng != null ? Number(row.agency_lng) : undefined,
    paymentMethod:   (row.payment_method as string ?? 'prepaid') as 'prepaid' | 'cash' | 'card',
    cashAmount:      row.cash_amount != null ? Number(row.cash_amount) : undefined,
    cashCollected:   (row.cash_collected as boolean) ?? false,
    lat:             row.lat as number | undefined,
    lng:             row.lng as number | undefined,
    deliveryAddress: row.delivery_address as string | undefined,
    deliveryLat:     row.delivery_lat as number | undefined,
    deliveryLng:     row.delivery_lng as number | undefined,
    createdAt:       row.created_at as Date,
    pickedUpAt:      row.picked_up_at as Date | undefined,
    arrivedAt:       row.arrived_at as Date | undefined,
    deliveredAt:     row.delivered_at as Date | undefined,
    deliveryNote:    row.delivery_note as string | undefined,
    cancelReason:    row.cancel_reason as string | undefined,
    rating:          row.rating as number | undefined,
    ratingComment:   row.rating_comment as string | undefined,
    ratedAt:         row.rated_at as Date | undefined,
  }
}

function mapRow(row: Record<string, unknown>): OrderWithDetails {
  return {
    id:              row.id as string,
    storeId:         row.store_id as string,
    delivererId:     row.deliverer_id as string | undefined,
    customerId:      row.customer_id as string,
    createdByUserId: row.created_by_user_id as string,
    status:          row.status as OrderStatus,
    routeId:         row.route_id as string | undefined,
    routePosition:   row.route_position as number | undefined,
    pickupCode:      row.pickup_code as string,
    deliveryCode:    row.delivery_code as string,
    notes:           row.notes as string | undefined,
    isPriority:      (row.is_priority as boolean) ?? false,
    maxDeliveryTime: row.max_delivery_time as Date | undefined,
    thirdPartyDelivery: (row.third_party_delivery as boolean) ?? false,
    agencyId:        row.agency_id as string | undefined,
    agencyName:      row.agency_name as string | undefined,
    agencyAddress:   row.agency_address as string | undefined,
    agencyLat:       row.agency_lat != null ? Number(row.agency_lat) : undefined,
    agencyLng:       row.agency_lng != null ? Number(row.agency_lng) : undefined,
    paymentMethod:   (row.payment_method as string ?? 'prepaid') as 'prepaid' | 'cash' | 'card',
    cashAmount:      row.cash_amount != null ? Number(row.cash_amount) : undefined,
    cashCollected:   (row.cash_collected as boolean) ?? false,
    lat:             row.lat as number | undefined,
    lng:             row.lng as number | undefined,
    createdAt:       row.created_at as Date,
    pickedUpAt:      row.picked_up_at as Date | undefined,
    outForDeliveryAt: row.out_for_delivery_at as Date | undefined,
    arrivedAt:       row.arrived_at as Date | undefined,
    deliveredAt:     row.delivered_at as Date | undefined,
    deliveryNote:    row.delivery_note as string | undefined,
    cancelReason:    row.cancel_reason as string | undefined,
    rating:          row.rating as number | undefined,
    ratingComment:   row.rating_comment as string | undefined,
    ratedAt:         row.rated_at as Date | undefined,
    log:             (row.log as OrderLogEntry[] | null) ?? [],
    summary:         (row.summary as OrderSummary | null) ?? undefined,
    customer: {
      id:         row.customer_id as string,
      name:       row.customer_name as string,
      phone:      row.customer_phone as string,
      address:    row.customer_address as string,
      complement: row.customer_complement as string | undefined,
      lat:        row.customer_lat as number | undefined,
      lng:        row.customer_lng as number | undefined,
    },
    deliverer: row.deliverer_id
      ? {
          id:     row.deliverer_id as string,
          name:   row.deliverer_name as string,
          status: row.deliverer_status as string,
        }
      : undefined,
    // Agência de entrega terceirizada (quando snapshot presente no pedido).
    agency: row.agency_address != null
      ? {
          id:      row.agency_id as string | undefined,
          name:    (row.agency_name as string | undefined) ?? '',
          address: row.agency_address as string,
          lat:     row.agency_lat != null ? Number(row.agency_lat) : undefined,
          lng:     row.agency_lng != null ? Number(row.agency_lng) : undefined,
        }
      : undefined,
    proofs: (row.proofs as Array<{ photoUrl: string; lat?: number; lng?: number }> | null) ?? [],
    // Backward-compat shorthand — first photo
    proof: ((row.proofs as Array<{ photoUrl: string; lat?: number; lng?: number }> | null) ?? [])[0],
    // Entrega fora do local: ponto esperado x 1º comprovante com coordenadas. Para
    // terceirizada, o alvo é a AGÊNCIA (não o endereço do cliente).
    deliveredOffTarget: (() => {
      if (row.status !== 'DELIVERED') return false
      const useAgency = row.agency_address != null
      const expLat = useAgency ? (row.agency_lat as number | null) : (row.customer_lat as number | null)
      const expLng = useAgency ? (row.agency_lng as number | null) : (row.customer_lng as number | null)
      const proof = ((row.proofs as Array<{ lat?: number; lng?: number }> | null) ?? [])
        .find(p => p.lat != null && p.lng != null)
      return isDeliveredOffTarget(expLat, expLng, proof?.lat, proof?.lng)
    })(),
    payments: ((row.payments as Array<{ amount: number; method: string; createdAt: string }> | null) ?? [])
      .map(p => ({ amount: Number(p.amount), method: p.method as 'cash' | 'pix' | 'card', createdAt: p.createdAt })),
  }
}

const WITH_JOINS = `
  SELECT
    o.*,
    c.name                                          AS customer_name,
    c.phone                                         AS customer_phone,
    COALESCE(o.delivery_address, ca.address)        AS customer_address,
    ca.complement                                   AS customer_complement,
    COALESCE(o.delivery_lat,  ca.lat)               AS customer_lat,
    COALESCE(o.delivery_lng,  ca.lng)               AS customer_lng,
    d.name       AS deliverer_name,
    d.status     AS deliverer_status,
    (SELECT COALESCE(
       json_agg(
         json_build_object('photoUrl', p.photo_url, 'lat', p.lat, 'lng', p.lng)
         ORDER BY p.photo_index ASC, p.created_at ASC
       ), '[]'::json)
     FROM proof_of_delivery p WHERE p.order_id = o.id) AS proofs,
    (SELECT COALESCE(
       json_agg(
         json_build_object('amount', pay.amount, 'method', pay.method, 'createdAt', pay.created_at)
         ORDER BY pay.created_at ASC
       ), '[]'::json)
     FROM order_payments pay WHERE pay.order_id = o.id) AS payments
  FROM orders o
  JOIN customers c   ON c.id = o.customer_id
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true
  LEFT JOIN deliverers d ON d.id = o.deliverer_id
`

// Variante para LISTAGEM (GET /orders): a listagem não usa `proofs`,
// `deliveredOffTarget` nem os `payments` individuais, então não vale rodar
// subquery correlata por linha — cada uma era um scan por pedido (caro quando
// a tabela cresce). A divergência de valor (SHORT_PAYMENT) já vem pronta em
// `o.summary` (calculada na entrega), então `proofs`/`payments` vêm vazios; o
// detalhe (findById) continua com WITH_JOINS completo.
const WITH_JOINS_LIST = `
  SELECT
    o.*,
    c.name                                          AS customer_name,
    c.phone                                         AS customer_phone,
    COALESCE(o.delivery_address, ca.address)        AS customer_address,
    ca.complement                                   AS customer_complement,
    COALESCE(o.delivery_lat,  ca.lat)               AS customer_lat,
    COALESCE(o.delivery_lng,  ca.lng)               AS customer_lng,
    d.name       AS deliverer_name,
    d.status     AS deliverer_status,
    '[]'::json   AS proofs,
    '[]'::json   AS payments
  FROM orders o
  JOIN customers c   ON c.id = o.customer_id
  LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true
  LEFT JOIN deliverers d ON d.id = o.deliverer_id
`

export function createPgOrderRepo(db: DB): IOrderRepository {
  return {
    async findById(id, storeId) {
      const { rows } = await db.query(
        `${WITH_JOINS} WHERE o.id = $1 AND o.store_id = $2 AND o.deleted_at IS NULL`,
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByStore(storeId, filters: OrderFilters) {
      const conditions = ['o.store_id = $1', 'o.deleted_at IS NULL']
      const params: unknown[] = [storeId]
      let idx = 2

      if (filters.status) {
        conditions.push(`o.status = $${idx++}`)
        params.push(filters.status)
      }
      if (filters.delivererId) {
        conditions.push(`o.deliverer_id = $${idx++}`)
        params.push(filters.delivererId)
      }
      if (filters.createdByUserId) {
        conditions.push(`o.created_by_user_id = $${idx++}`)
        params.push(filters.createdByUserId)
      }

      const limit  = filters.limit ?? 50
      const offset = ((filters.page ?? 1) - 1) * limit
      params.push(limit, offset)

      const { rows } = await db.query(
        `${WITH_JOINS_LIST}
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.is_priority DESC, o.max_delivery_time ASC NULLS LAST, o.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      )
      return rows.map(mapRow)
    },

    async searchByStore(storeId, filters: OrderFilters) {
      const conditions = ['o.store_id = $1', 'o.deleted_at IS NULL']
      const params: unknown[] = [storeId]
      let idx = 2

      if (filters.status) {
        conditions.push(`o.status = $${idx++}`)
        params.push(filters.status)
      }
      if (filters.createdByUserId) {
        conditions.push(`o.created_by_user_id = $${idx++}`)
        params.push(filters.createdByUserId)
      }
      if (filters.customerName) {
        conditions.push(`c.name ILIKE $${idx++}`)
        params.push(`%${filters.customerName}%`)
      }
      if (filters.dateFrom) {
        conditions.push(`o.created_at >= $${idx++}::date`)
        params.push(filters.dateFrom)
      }
      if (filters.dateTo) {
        conditions.push(`o.created_at < ($${idx++}::date + interval '1 day')`)
        params.push(filters.dateTo)
      }
      if (filters.delivererId) {
        conditions.push(`o.deliverer_id = $${idx++}`)
        params.push(filters.delivererId)
      }

      const limit  = filters.limit ?? 20
      const offset = ((filters.page ?? 1) - 1) * limit
      params.push(limit, offset)

      // WITH_JOINS_LIST (sem os subselects de proofs/payments): a tela de busca
      // não usa esses campos (divergência de pagamento já vem pronta em
      // `summary`), e com COUNT(*) OVER() essas subqueries rodariam para todo
      // pedido do filtro, não só para a página exibida — caro à toa.
      const { rows } = await db.query(
        `SELECT sub.*, COUNT(*) OVER() AS total_count
         FROM (
           ${WITH_JOINS_LIST}
           WHERE ${conditions.join(' AND ')}
           ORDER BY o.created_at DESC
         ) sub
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      )
      const total = rows.length > 0 ? Number((rows[0] as Record<string, unknown>).total_count) : 0
      return { items: rows.map(mapRow), total }
    },

    async findByDeliverer(delivererId) {
      // Active stops (ON_ROUTE / OUT_FOR_DELIVERY) plus DELIVERED stops whose
      // route still has at least one active stop — so completed stops stay
      // visible (faded, read-only) on the deliverer app until the whole route
      // is finished.
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.deliverer_id = $1
           AND o.deleted_at IS NULL
           AND (
             o.status IN ('ON_ROUTE','OUT_FOR_DELIVERY')
             OR (
               o.status = 'DELIVERED'
               AND o.route_id IS NOT NULL
               AND o.route_id IN (
                 SELECT route_id FROM orders
                 WHERE deliverer_id = $1
                   AND status IN ('ON_ROUTE','OUT_FOR_DELIVERY')
                   AND route_id IS NOT NULL
                   AND deleted_at IS NULL
               )
             )
           )
         ORDER BY o.route_position ASC`,
        [delivererId]
      )
      return rows.map(mapRow)
    },

    async findByDelivererAndId(delivererId, orderId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.deliverer_id = $1 AND o.id = $2 AND o.deleted_at IS NULL
         LIMIT 1`,
        [delivererId, orderId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByRoute(routeId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.route_id = $1 AND o.deleted_at IS NULL
         ORDER BY o.route_position ASC NULLS LAST`,
        [routeId]
      )
      return rows.map(mapRow)
    },

    async findNextOnRoute(routeId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.route_id = $1 AND o.status = 'ON_ROUTE' AND o.deleted_at IS NULL
         ORDER BY o.route_position ASC NULLS LAST
         LIMIT 1`,
        [routeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findPreparing(storeId, requestingDelivererId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.store_id = $1 AND o.status = 'PREPARING' AND o.deliverer_id IS NULL
           AND o.deleted_at IS NULL
           AND (
             o.reserved_by IS NULL
             OR o.reserved_by = $2
             OR o.reserved_at < now() - interval '2 minutes'
           )
         ORDER BY o.is_priority DESC, o.max_delivery_time ASC NULLS LAST, o.created_at ASC`,
        [storeId, requestingDelivererId ?? null]
      )
      return rows.map(mapRow)
    },

    async create(data) {
      const { rows } = await db.query(
        `INSERT INTO orders
           (store_id, customer_id, created_by_user_id, status, pickup_code, delivery_code,
            notes, is_priority, max_delivery_time, payment_method, cash_amount,
            lat, lng, delivery_address, delivery_lat, delivery_lng, third_party_delivery,
            agency_id, agency_name, agency_address, agency_lat, agency_lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING *`,
        [
          data.storeId, data.customerId, data.createdByUserId,
          data.status, data.pickupCode, data.deliveryCode,
          data.notes ?? null,
          data.isPriority ?? false,
          data.maxDeliveryTime ?? null,
          (data as Record<string, unknown>).paymentMethod ?? 'prepaid',
          (data as Record<string, unknown>).cashAmount ?? null,
          data.lat ?? null, data.lng ?? null,
          data.deliveryAddress ?? null, data.deliveryLat ?? null, data.deliveryLng ?? null,
          data.thirdPartyDelivery ?? false,
          data.agencyId ?? null, data.agencyName ?? null, data.agencyAddress ?? null,
          data.agencyLat ?? null, data.agencyLng ?? null,
        ]
      )
      return mapOrderRow(rows[0] as Record<string, unknown>)
    },

    async updatePriority(id, isPriority, maxDeliveryTime) {
      const { rows } = await db.query(
        `UPDATE orders SET is_priority = $2, max_delivery_time = $3 WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [id, isPriority, maxDeliveryTime]
      )
      return mapOrderRow(rows[0] as Record<string, unknown>)
    },

    async updateStatus(id, status, extra = {}) {
      const sets: string[]   = ['status = $2']
      const params: unknown[] = [id, status]
      let idx = 3

      if (extra.pickedUpAt)                  { sets.push(`picked_up_at = $${idx++}`);  params.push(extra.pickedUpAt) }
      if (extra.outForDeliveryAt)            { sets.push(`out_for_delivery_at = $${idx++}`); params.push(extra.outForDeliveryAt) }
      if (extra.deliveredAt)                 { sets.push(`delivered_at = $${idx++}`);  params.push(extra.deliveredAt) }
      if (extra.deliveryNote !== undefined)  { sets.push(`delivery_note = $${idx++}`); params.push(extra.deliveryNote) }
      if (extra.cashCollected !== undefined) { sets.push(`cash_collected = $${idx++}`); params.push(extra.cashCollected) }

      const { rows } = await db.query(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        params
      )
      return mapOrderRow(rows[0] as Record<string, unknown>)
    },

    async finalizeDelivered(id, { deliveredAt, deliveryNote, cashCollected, logEntry, summary }) {
      // Status + timestamp + auditoria (append no log) + summary numa escrita só.
      const { rows } = await db.query(
        `UPDATE orders SET
           status         = 'DELIVERED',
           delivered_at   = $2,
           delivery_note  = COALESCE($3, delivery_note),
           cash_collected = COALESCE($4, cash_collected),
           log            = COALESCE(log, '[]'::jsonb) || $5::jsonb,
           summary        = $6::jsonb
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [
          id, deliveredAt, deliveryNote ?? null,
          cashCollected ?? null,
          JSON.stringify([logEntry]), JSON.stringify(summary),
        ]
      )
      return mapOrderRow(rows[0] as Record<string, unknown>)
    },

    async transitionToOutForDelivery(id) {
      // Guarda atômica: só transiciona quando ainda ON_ROUTE. RETURNING garante que
      // só o chamador que realmente mudou o status dispara efeitos (notificação 1x).
      const { rows } = await db.query(
        `UPDATE orders
         SET status = 'OUT_FOR_DELIVERY', out_for_delivery_at = COALESCE(out_for_delivery_at, now())
         WHERE id = $1 AND status = 'ON_ROUTE' AND deleted_at IS NULL
         RETURNING *`,
        [id]
      )
      return rows[0] ? mapOrderRow(rows[0] as Record<string, unknown>) : null
    },

    async appendLog(orderId, entry) {
      await db.query(
        `UPDATE orders SET log = COALESCE(log, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
        [orderId, JSON.stringify([entry])]
      )
    },

    async setSummary(orderId, summary) {
      await db.query(
        `UPDATE orders SET summary = $2::jsonb WHERE id = $1`,
        [orderId, JSON.stringify(summary)]
      )
    },

    async assignDeliverer(id, delivererId, routePosition) {
      const { rows } = await db.query(
        `UPDATE orders
         SET deliverer_id = $2, route_position = $3, status = 'ASSIGNED',
             accepted_at = COALESCE(accepted_at, now())
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [id, delivererId, routePosition]
      )
      return mapOrderRow(rows[0] as Record<string, unknown>)
    },

    async addProof(orderId, photoUrl, lat, lng, photoIndex = 1) {
      // Idempotente: o endpoint de entrega pode ser reenviado (timeout no app).
      // O caminho no storage é determinístico por índice, então a mesma foto no
      // mesmo índice sempre mapeia para a mesma linha.
      await db.query(
        `INSERT INTO proof_of_delivery (order_id, photo_url, lat, lng, photo_index)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (order_id, photo_index)
           DO UPDATE SET photo_url = EXCLUDED.photo_url, lat = EXCLUDED.lat, lng = EXCLUDED.lng`,
        [orderId, photoUrl, lat ?? null, lng ?? null, photoIndex]
      )
    },

    async addPayment(orderId, payment, delivererId) {
      await db.query(
        `INSERT INTO order_payments (order_id, amount, method, created_by)
         VALUES ($1,$2,$3,$4)`,
        [orderId, payment.amount, payment.method, delivererId ?? null]
      )
    },

    async submitRating(orderId, rating, comment) {
      await db.query(
        `UPDATE orders
         SET rating = $2, rating_comment = $3, rated_at = now()
         WHERE id = $1 AND status = 'DELIVERED' AND rating IS NULL AND deleted_at IS NULL`,
        [orderId, rating, comment ?? null]
      )
    },

    async getPublic(id) {
      const { rows } = await db.query(
        `${WITH_JOINS} WHERE o.id = $1 AND o.deleted_at IS NULL`,
        [id]
      )
      if (!rows[0]) return null
      const o = mapRow(rows[0])
      return {
        id:            o.id,
        status:        o.status,
        deliveryCode:  o.deliveryCode,
        customer:      { name: o.customer.name, address: o.customer.address, lat: o.customer.lat, lng: o.customer.lng },
        deliverer:     o.deliverer ? { name: o.deliverer.name } : undefined,
        routePosition: o.routePosition,
        isCurrentStop: o.routePosition === 1,
        rating:        o.rating,
        ratingComment: o.ratingComment,
        ratingEnabled: false, // overridden by route handler
      } as PublicOrderView
    },

    async findInTransit() {
      // Pedidos em rota (já retirados) com os minutos desde a retirada e os
      // limiares de atraso resolvidos por loja (override → default do catálogo).
      const { rows } = await db.query(
        `SELECT
           o.id,
           o.store_id,
           o.deliverer_id,
           c.name AS customer_name,
           d.name AS deliverer_name,
           EXTRACT(EPOCH FROM (now() - o.picked_up_at)) / 60 AS minutes,
           COALESCE(
             (SELECT ssv.value FROM store_setting_values ssv
                JOIN settings s ON s.id = ssv.setting_id
              WHERE s.name = 'delay_transit_yellow_min' AND ssv.store_id = o.store_id),
             (SELECT default_value FROM settings WHERE name = 'delay_transit_yellow_min'),
             '50'
           ) AS transit_yellow_min,
           COALESCE(
             (SELECT ssv.value FROM store_setting_values ssv
                JOIN settings s ON s.id = ssv.setting_id
              WHERE s.name = 'delay_transit_red_min' AND ssv.store_id = o.store_id),
             (SELECT default_value FROM settings WHERE name = 'delay_transit_red_min'),
             '60'
           ) AS transit_red_min
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN deliverers d ON d.id = o.deliverer_id
         WHERE o.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY')
           AND o.picked_up_at IS NOT NULL
           AND o.deleted_at IS NULL`,
        []
      )
      return rows.map((r): InTransitOrder => ({
        id:               r.id as string,
        storeId:          r.store_id as string,
        delivererId:      (r.deliverer_id as string | null) ?? undefined,
        customerName:     r.customer_name as string,
        delivererName:    (r.deliverer_name as string | null) ?? undefined,
        minutes:          Number(r.minutes),
        transitYellowMin: parseInt(r.transit_yellow_min as string, 10),
        transitRedMin:    parseInt(r.transit_red_min as string, 10),
      }))
    },

    async findPriorityOverdue() {
      // Pedidos prioritários ativos cujo horário máximo de entrega já passou.
      const { rows } = await db.query(
        `SELECT
           o.id,
           o.store_id,
           o.deliverer_id,
           o.max_delivery_time,
           c.name AS customer_name,
           d.name AS deliverer_name,
           EXTRACT(EPOCH FROM (now() - o.max_delivery_time)) / 60 AS minutes_late
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN deliverers d ON d.id = o.deliverer_id
         WHERE o.is_priority
           AND o.max_delivery_time IS NOT NULL
           AND now() > o.max_delivery_time
           AND o.status NOT IN ('DELIVERED', 'CANCELLED')
           AND o.deleted_at IS NULL`,
        []
      )
      return rows.map((r): PriorityOverdueOrder => ({
        id:              r.id as string,
        storeId:         r.store_id as string,
        delivererId:     (r.deliverer_id as string | null) ?? undefined,
        customerName:    r.customer_name as string,
        delivererName:   (r.deliverer_name as string | null) ?? undefined,
        maxDeliveryTime: r.max_delivery_time as Date,
        minutesLate:     Number(r.minutes_late),
      }))
    },

    async findDelayedSummary(storeId) {
      // Conta pedidos atrasados (limiar VERMELHO) desta loja, separados por fase:
      // - pickup: PREPARING e ainda não retirado, parado desde created_at.
      // - delivery: em rota (já retirado), parado desde picked_up_at.
      // Os limiares são resolvidos por loja (override → default do catálogo), no
      // mesmo padrão de findInTransit.
      const { rows } = await db.query(
        `WITH thresholds AS (
           SELECT
             COALESCE(
               (SELECT ssv.value FROM store_setting_values ssv
                  JOIN settings s ON s.id = ssv.setting_id
                WHERE s.name = 'delay_prep_red_min' AND ssv.store_id = $1),
               (SELECT default_value FROM settings WHERE name = 'delay_prep_red_min'),
               '30'
             )::int AS prep_red_min,
             COALESCE(
               (SELECT ssv.value FROM store_setting_values ssv
                  JOIN settings s ON s.id = ssv.setting_id
                WHERE s.name = 'delay_transit_red_min' AND ssv.store_id = $1),
               (SELECT default_value FROM settings WHERE name = 'delay_transit_red_min'),
               '60'
             )::int AS transit_red_min
         )
SELECT
           t.prep_red_min AS prep_red_min,
           (SELECT COUNT(*) FROM orders o
             WHERE o.store_id = $1
               AND o.status = 'PREPARING'
               AND o.picked_up_at IS NULL
               AND o.deleted_at IS NULL
               AND EXTRACT(EPOCH FROM (now() - o.created_at)) / 60 >= t.prep_red_min
           ) AS pickup_delayed,
           (SELECT COUNT(*) FROM orders o
             WHERE o.store_id = $1
               AND o.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY')
               AND o.picked_up_at IS NOT NULL
               AND o.deleted_at IS NULL
               AND EXTRACT(EPOCH FROM (now() - o.picked_up_at)) / 60 >= t.transit_red_min
           ) AS delivery_delayed
         FROM thresholds t`,
        [storeId]
      )
      const r = rows[0] as Record<string, unknown>
      return {
        pickupDelayed:   Number(r.pickup_delayed ?? 0),
        deliveryDelayed: Number(r.delivery_delayed ?? 0),
        prepRedMin:      Number(r.prep_red_min ?? 30),
      }
    },

    async getMinPendingRoutePosition(routeId) {
      const { rows } = await db.query<{ pos: number | null }>(
        `SELECT MIN(route_position) AS pos
         FROM orders
         WHERE route_id = $1 AND status NOT IN ('DELIVERED', 'CANCELLED') AND deleted_at IS NULL`,
        [routeId]
      )
      const pos = rows[0]?.pos
      return pos != null ? Number(pos) : null
    },
  }
}
