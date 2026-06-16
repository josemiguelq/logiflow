import { DB } from '../../../../shared/db/client'
import { notificationQueue } from '../../../../shared/infra/queue'

const MIN_DISTANCE_METERS = 50
const MIN_TIME_SECONDS    = 60

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function createPgTrackingRepo(db: DB) {
  return {
    async recordLocation(
      delivererId: string,
      lat: number,
      lng: number,
      recordedAt?: Date,
    ) {
      const { rows: statusRows } = await db.query(
        `SELECT status FROM deliverers WHERE id = $1`,
        [delivererId]
      )
      if (statusRows[0]?.status === 'OFFLINE') return false

      const ts = recordedAt ?? new Date()

      // Chegada ao endereço: na primeira vez que o entregador entra no raio de
      // chegada de um pedido em rota, registra arrived_at (mesmo que o ping seja
      // depois descartado pela deduplicação). Permite medir chegada → entrega.
      await this.detectArrival(delivererId, lat, lng, ts)

      const { rows: last } = await db.query(
        `SELECT lat, lng, recorded_at
         FROM location_history
         WHERE deliverer_id = $1
         ORDER BY recorded_at DESC LIMIT 1`,
        [delivererId]
      )

      if (last[0]) {
        const dist = haversineMeters(last[0].lat, last[0].lng, lat, lng)
        const elapsed = (ts.getTime() - new Date(last[0].recorded_at).getTime()) / 1000
        if (dist < MIN_DISTANCE_METERS && elapsed < MIN_TIME_SECONDS) return false
      }

      await db.query(
        `INSERT INTO location_history (deliverer_id, lat, lng, recorded_at)
         VALUES ($1,$2,$3,$4)`,
        [delivererId, lat, lng, ts]
      )
      return true
    },

    async recordBatch(
      delivererId: string,
      points: Array<{ lat: number; lng: number; recordedAt: Date }>,
    ) {
      const { rows: statusRows } = await db.query(
        `SELECT status FROM deliverers WHERE id = $1`,
        [delivererId]
      )
      if (statusRows[0]?.status === 'OFFLINE') return 0

      // Process in chronological order, re-using the same dedup logic
      const sorted = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      let saved = 0
      for (const p of sorted) {
        const ok = await this.recordLocation(delivererId, p.lat, p.lng, p.recordedAt)
        if (ok) saved++
      }
      return saved
    },

    // Marca arrived_at dos pedidos em rota do entregador cujo destino está dentro
    // do raio de chegada da loja (settings.arrival_radius_meters, padrão 20 m).
    async detectArrival(delivererId: string, lat: number, lng: number, ts: Date) {
      const { rows } = await db.query(
        `SELECT o.id, o.store_id, o.status,
                COALESCE(o.delivery_lat, ca.lat) AS dlat,
                COALESCE(o.delivery_lng, ca.lng) AS dlng,
                COALESCE(NULLIF(sv.value, ''), s.default_value, '20')::float AS radius
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN customer_addresses ca ON ca.customer_id = c.id AND ca.is_default = true
         LEFT JOIN settings s ON s.name = 'arrival_radius_meters'
         LEFT JOIN store_setting_values sv ON sv.setting_id = s.id AND sv.store_id = o.store_id
         WHERE o.deliverer_id = $1
           AND o.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY')
           AND o.arrived_at IS NULL`,
        [delivererId]
      )

      for (const r of rows) {
        if (r.dlat == null || r.dlng == null) continue
        const dist = haversineMeters(lat, lng, Number(r.dlat), Number(r.dlng))
        if (dist > Number(r.radius)) continue

        // RETURNING garante que só notificamos quando ESTE ping marcou a chegada
        // (e não um ping concorrente), evitando notificação duplicada.
        const { rows: updated } = await db.query(
          `UPDATE orders SET arrived_at = $2 WHERE id = $1 AND arrived_at IS NULL RETURNING id`,
          [r.id, ts]
        )
        // Notificação de proximidade: só faz sentido para a parada ativa
        // (OUT_FOR_DELIVERY). O worker decide o envio conforme as settings da loja.
        if (updated.length > 0 && r.status === 'OUT_FOR_DELIVERY') {
          notificationQueue.add('status_changed', {
            type: 'whatsapp', storeId: r.store_id, orderId: r.id, statusEvent: 'ARRIVING',
          }).catch(() => { /* non-fatal */ })
        }
      }
    },

    async getLatest(delivererId: string) {
      const { rows } = await db.query(
        `SELECT lat, lng, recorded_at
         FROM location_history
         WHERE deliverer_id = $1
         ORDER BY recorded_at DESC LIMIT 1`,
        [delivererId]
      )
      return rows[0] ?? null
    },

    async getHistory(delivererId: string, from: Date, to: Date) {
      const { rows } = await db.query(
        `SELECT lat, lng, recorded_at
         FROM location_history
         WHERE deliverer_id = $1
           AND recorded_at >= $2
           AND recorded_at <= $3
         ORDER BY recorded_at ASC`,
        [delivererId, from, to]
      )
      return rows
    },
  }
}
