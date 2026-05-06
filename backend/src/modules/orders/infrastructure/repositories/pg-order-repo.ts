import { DB } from '../../../../shared/db/client'
import { Order, OrderStatus, OrderWithDetails } from '../../domain/entities'
import { IOrderRepository, OrderFilters, PublicOrderView } from '../../application/ports'

function mapRow(row: Record<string, unknown>): OrderWithDetails {
  return {
    id:              row.id as string,
    storeId:         row.store_id as string,
    delivererId:     row.deliverer_id as string | undefined,
    customerId:      row.customer_id as string,
    createdByUserId: row.created_by_user_id as string,
    status:          row.status as OrderStatus,
    routePosition:   row.route_position as number | undefined,
    pickupCode:      row.pickup_code as string,
    deliveryCode:    row.delivery_code as string,
    notes:           row.notes as string | undefined,
    lat:             row.lat as number | undefined,
    lng:             row.lng as number | undefined,
    createdAt:       row.created_at as Date,
    pickedUpAt:      row.picked_up_at as Date | undefined,
    deliveredAt:     row.delivered_at as Date | undefined,
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
    proof: row.proof_photo_url
      ? {
          photoUrl: row.proof_photo_url as string,
          lat:      row.proof_lat as number | undefined,
          lng:      row.proof_lng as number | undefined,
        }
      : undefined,
  }
}

const WITH_JOINS = `
  SELECT
    o.*,
    c.name                                          AS customer_name,
    c.phone                                         AS customer_phone,
    COALESCE(o.delivery_address, c.address)         AS customer_address,
    c.complement                                    AS customer_complement,
    COALESCE(o.delivery_lat,  c.lat)                AS customer_lat,
    COALESCE(o.delivery_lng,  c.lng)                AS customer_lng,
    d.name       AS deliverer_name,
    d.status     AS deliverer_status,
    p.photo_url  AS proof_photo_url,
    p.lat        AS proof_lat,
    p.lng        AS proof_lng
  FROM orders o
  JOIN customers c   ON c.id = o.customer_id
  LEFT JOIN deliverers d ON d.id = o.deliverer_id
  LEFT JOIN proof_of_delivery p ON p.order_id = o.id
`

export function createPgOrderRepo(db: DB): IOrderRepository {
  return {
    async findById(id, storeId) {
      const { rows } = await db.query(
        `${WITH_JOINS} WHERE o.id = $1 AND o.store_id = $2`,
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async findByStore(storeId, filters: OrderFilters) {
      const conditions = ['o.store_id = $1']
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
        `${WITH_JOINS}
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.created_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      )
      return rows.map(mapRow)
    },

    async findByDeliverer(delivererId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.deliverer_id = $1
           AND o.status NOT IN ('DELIVERED','CANCELLED')
         ORDER BY o.route_position ASC`,
        [delivererId]
      )
      return rows.map(mapRow)
    },

    async findPreparing(storeId) {
      const { rows } = await db.query(
        `${WITH_JOINS}
         WHERE o.store_id = $1 AND o.status = 'PREPARING' AND o.deliverer_id IS NULL
         ORDER BY o.created_at ASC`,
        [storeId]
      )
      return rows.map(mapRow)
    },

    async create(data) {
      const { rows } = await db.query(
        `INSERT INTO orders
           (store_id, customer_id, created_by_user_id, status, pickup_code, delivery_code,
            notes, lat, lng, delivery_address, delivery_lat, delivery_lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [
          data.storeId, data.customerId, data.createdByUserId,
          data.status, data.pickupCode, data.deliveryCode,
          data.notes ?? null, data.lat ?? null, data.lng ?? null,
          data.deliveryAddress ?? null, data.deliveryLat ?? null, data.deliveryLng ?? null,
        ]
      )
      return rows[0] as Order
    },

    async updateStatus(id, status, extra = {}) {
      const sets: string[]   = ['status = $2']
      const params: unknown[] = [id, status]
      let idx = 3

      if (extra.pickedUpAt) { sets.push(`picked_up_at = $${idx++}`); params.push(extra.pickedUpAt) }
      if (extra.deliveredAt) { sets.push(`delivered_at = $${idx++}`); params.push(extra.deliveredAt) }

      const { rows } = await db.query(
        `UPDATE orders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        params
      )
      return rows[0] as Order
    },

    async assignDeliverer(id, delivererId, routePosition) {
      const { rows } = await db.query(
        `UPDATE orders
         SET deliverer_id = $2, route_position = $3, status = 'ASSIGNED'
         WHERE id = $1
         RETURNING *`,
        [id, delivererId, routePosition]
      )
      return rows[0] as Order
    },

    async addProof(orderId, photoUrl, lat, lng) {
      await db.query(
        `INSERT INTO proof_of_delivery (order_id, photo_url, lat, lng)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (order_id) DO UPDATE
         SET photo_url = $2, lat = $3, lng = $4`,
        [orderId, photoUrl, lat ?? null, lng ?? null]
      )
    },

    async getPublic(id) {
      const { rows } = await db.query(
        `${WITH_JOINS} WHERE o.id = $1`,
        [id]
      )
      if (!rows[0]) return null
      const o = mapRow(rows[0])
      return {
        id:           o.id,
        status:       o.status,
        deliveryCode: o.deliveryCode,
        customer:     { name: o.customer.name, address: o.customer.address },
        deliverer:    o.deliverer
          ? { name: o.deliverer.name }
          : undefined,
        routePosition: o.routePosition,
        isCurrentStop: o.routePosition === 1,
      } as PublicOrderView
    },
  }
}
