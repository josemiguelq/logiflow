import { DB } from '../../../../shared/db/client'
import { notificationQueue } from '../../../../shared/infra/queue'

const MIN_DISTANCE_METERS = 50
const MIN_TIME_SECONDS    = 60
const MAX_SAVED_POINTS    = 200

// Reduz um array já ordenado para no máximo `max` pontos, pegando amostras
// igualmente espaçadas e sempre mantendo o primeiro e o último ponto, de modo
// a preservar o formato do trajeto.
function downsample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  const out: T[] = []
  const stride = (items.length - 1) / (max - 1)
  for (let i = 0; i < max; i++) out.push(items[Math.round(i * stride)]!)
  return out
}

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

      // Ordem cronológica; lotes grandes (muito tempo offline) são amostrados
      // para no máximo MAX_SAVED_POINTS, preservando o formato do trajeto.
      const sorted  = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
      const sampled = downsample(sorted, MAX_SAVED_POINTS)
      if (sampled.length === 0) return 0

      // Tudo que o loop precisa é buscado UMA vez (evita N+1 por ponto):
      //  - última posição salva → deduplicação em memória;
      //  - destinos dos pedidos em rota → detecção de chegada em memória.
      const [lastRes, arrivals] = await Promise.all([
        db.query(
          `SELECT lat, lng, recorded_at FROM location_history
           WHERE deliverer_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
          [delivererId]
        ),
        this.pendingArrivals(delivererId),
      ])

      const lastRow = lastRes.rows[0]
      let last = lastRow
        ? { lat: Number(lastRow.lat), lng: Number(lastRow.lng), t: new Date(lastRow.recorded_at).getTime() }
        : null

      const pending = arrivals
        .filter((r: Record<string, unknown>) => r.dlat != null && r.dlng != null)
        .map((r: Record<string, unknown>) => ({
          row: r, dlat: Number(r.dlat), dlng: Number(r.dlng), radius: Number(r.radius), done: false,
        }))

      const toInsert: Array<{ lat: number; lng: number; recordedAt: Date }> = []
      const arrivalHits: Array<{ order: Record<string, unknown>; ts: Date }> = []

      for (const p of sampled) {
        // Chegada: primeira vez (cronologicamente) que entra no raio de um pedido.
        for (const a of pending) {
          if (a.done) continue
          if (haversineMeters(p.lat, p.lng, a.dlat, a.dlng) <= a.radius) {
            a.done = true
            arrivalHits.push({ order: a.row, ts: p.recordedAt })
          }
        }
        // Deduplicação (mesma regra 50m/60s) contra o último ponto salvo, em memória.
        if (last) {
          const dist = haversineMeters(last.lat, last.lng, p.lat, p.lng)
          const elapsed = (p.recordedAt.getTime() - last.t) / 1000
          if (dist < MIN_DISTANCE_METERS && elapsed < MIN_TIME_SECONDS) continue
        }
        toInsert.push(p)
        last = { lat: p.lat, lng: p.lng, t: p.recordedAt.getTime() }
      }

      // Grava as chegadas detectadas (poucas), com o mesmo guard de concorrência.
      for (const hit of arrivalHits) {
        await this.markArrival(hit.order, hit.ts)
      }

      // Insere todos os pontos deduplicados numa ÚNICA query multi-linha.
      if (toInsert.length > 0) {
        const values: string[] = []
        const params: unknown[] = []
        toInsert.forEach((p, i) => {
          const b = i * 4
          values.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4})`)
          params.push(delivererId, p.lat, p.lng, p.recordedAt)
        })
        await db.query(
          `INSERT INTO location_history (deliverer_id, lat, lng, recorded_at) VALUES ${values.join(', ')}`,
          params
        )
      }
      return toInsert.length
    },

    // Pedidos em rota do entregador ainda sem chegada registrada, com o destino
    // e o raio de chegada da loja (settings.arrival_radius_meters, padrão 20 m).
    async pendingArrivals(delivererId: string) {
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
      return rows
    },

    // Marca arrived_at de um pedido (guard contra concorrência) e, se for a parada
    // ativa, enfileira a notificação de proximidade.
    async markArrival(order: Record<string, unknown>, ts: Date) {
      // RETURNING garante que só notificamos quando ESTE ping marcou a chegada
      // (e não um ping concorrente), evitando notificação duplicada.
      const { rows: updated } = await db.query(
        `UPDATE orders SET arrived_at = $2 WHERE id = $1 AND arrived_at IS NULL RETURNING id`,
        [order.id, ts]
      )
      if (updated.length > 0 && order.status === 'OUT_FOR_DELIVERY') {
        notificationQueue.add('status_changed', {
          type: 'whatsapp', storeId: order.store_id, orderId: order.id, statusEvent: 'ARRIVING',
        }).catch(() => { /* non-fatal */ })
      }
    },

    // Marca arrived_at dos pedidos em rota do entregador cujo destino está dentro
    // do raio de chegada da loja. (Ping único; o batch faz isso em memória.)
    async detectArrival(delivererId: string, lat: number, lng: number, ts: Date) {
      const rows = await this.pendingArrivals(delivererId)
      for (const r of rows) {
        if (r.dlat == null || r.dlng == null) continue
        const dist = haversineMeters(lat, lng, Number(r.dlat), Number(r.dlng))
        if (dist > Number(r.radius)) continue
        await this.markArrival(r, ts)
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
