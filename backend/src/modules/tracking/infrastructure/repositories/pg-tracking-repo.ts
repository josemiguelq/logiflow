import { DB } from '../../../../shared/db/client'

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
      orderId: string | null,
      lat: number,
      lng: number
    ) {
      const { rows: last } = await db.query(
        `SELECT lat, lng, recorded_at
         FROM location_history
         WHERE deliverer_id = $1
         ORDER BY recorded_at DESC LIMIT 1`,
        [delivererId]
      )

      if (last[0]) {
        const dist = haversineMeters(last[0].lat, last[0].lng, lat, lng)
        const elapsed =
          (Date.now() - new Date(last[0].recorded_at).getTime()) / 1000
        if (dist < MIN_DISTANCE_METERS && elapsed < MIN_TIME_SECONDS) return false
      }

      await db.query(
        `INSERT INTO location_history (deliverer_id, order_id, lat, lng)
         VALUES ($1,$2,$3,$4)`,
        [delivererId, orderId, lat, lng]
      )
      return true
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

    async getHistory(delivererId: string, since?: Date) {
      const { rows } = await db.query(
        `SELECT lat, lng, recorded_at
         FROM location_history
         WHERE deliverer_id = $1
           AND recorded_at > $2
         ORDER BY recorded_at ASC`,
        [delivererId, since ?? new Date(Date.now() - 3_600_000)]
      )
      return rows
    },
  }
}
