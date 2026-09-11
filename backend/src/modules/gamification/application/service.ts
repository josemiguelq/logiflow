import { db } from '../../../shared/db/client'

// Fuso usado para fechar o "dia" das conquistas (mesmo padrão do /deliverer/analytics).
const TZ = 'America/Sao_Paulo'

export const ACHIEVEMENTS = ['ROUTE_MASTER', 'CARAVAN_CAPTAIN', 'ORDER_HUNTER'] as const
export type AchievementKey = typeof ACHIEVEMENTS[number]

export interface AchvConfig {
  routesTarget:  number  // X — rotas finalizadas no dia (Mestre das Rotas)
  caravanOrders: number  // Y — pedidos numa mesma rota (Capitão da Caravana)
  hunterMinutes: number  // Z — janela do aceite (Caçador de Pedidos)
  hunterCount:   number  // N — aceites rápidos no dia (Caçador de Pedidos)
}

export interface EarnedAchievement {
  achievement: AchievementKey
  target:      number
  metric:      Record<string, number>
}

export async function getConfig(storeId: string): Promise<AchvConfig> {
  const { rows } = await db.query(
    `SELECT s.name, COALESCE(ssv.value, s.default_value) AS value
     FROM settings s
     LEFT JOIN store_setting_values ssv ON ssv.setting_id = s.id AND ssv.store_id = $1
     WHERE s.name IN ('achv_routes_target','achv_caravan_orders','achv_hunter_minutes','achv_hunter_count')`,
    [storeId]
  )
  const m = Object.fromEntries((rows as { name: string; value: string }[]).map(r => [r.name, r.value]))
  return {
    routesTarget:  parseInt(m.achv_routes_target  ?? '5',  10) || 5,
    caravanOrders: parseInt(m.achv_caravan_orders ?? '8',  10) || 8,
    hunterMinutes: parseInt(m.achv_hunter_minutes ?? '10', 10) || 10,
    hunterCount:   parseInt(m.achv_hunter_count   ?? '3',  10) || 3,
  }
}

interface DayMetricsRow {
  deliverer_id: string
  day:          string   // 'YYYY-MM-DD' no fuso da loja
  routes_count: number
  max_orders:   number
  fast_count:   number
}

// Métricas por (entregador, dia) a partir dos dados crus, numa janela de N dias.
// delivererId opcional restringe a um entregador (tela); null avalia todos (job).
async function computeRange(
  storeId: string, delivererId: string | null, windowDays: number, hunterMinutes: number,
): Promise<DayMetricsRow[]> {
  const { rows } = await db.query(
    `WITH route_agg AS (
       SELECT r.deliverer_id AS did,
              (r.finished_at AT TIME ZONE '${TZ}')::date AS day,
              COUNT(DISTINCT r.id) AS routes_count,
              MAX(rc.cnt)          AS max_orders
       FROM routes r
       JOIN LATERAL (SELECT COUNT(*) AS cnt FROM orders o WHERE o.route_id = r.id AND o.deleted_at IS NULL) rc ON true
       WHERE r.store_id = $1 AND r.status = 'FINISHED' AND r.deleted_at IS NULL
         AND r.finished_at >= now() - make_interval(days => $4::int)
         AND ($2::uuid IS NULL OR r.deliverer_id = $2)
       GROUP BY r.deliverer_id, day
     ),
     hunter_agg AS (
       SELECT o.deliverer_id AS did,
              (o.accepted_at AT TIME ZONE '${TZ}')::date AS day,
              COUNT(*) FILTER (WHERE o.accepted_at - o.created_at < make_interval(mins => $3::int)) AS fast_count
       FROM orders o
       WHERE o.store_id = $1 AND o.deliverer_id IS NOT NULL AND o.accepted_at IS NOT NULL
         AND o.deleted_at IS NULL
         AND o.accepted_at >= now() - make_interval(days => $4::int)
         AND ($2::uuid IS NULL OR o.deliverer_id = $2)
       GROUP BY o.deliverer_id, day
     )
     SELECT COALESCE(r.did, h.did)                       AS deliverer_id,
            to_char(COALESCE(r.day, h.day), 'YYYY-MM-DD') AS day,
            COALESCE(r.routes_count, 0)::int             AS routes_count,
            COALESCE(r.max_orders,   0)::int             AS max_orders,
            COALESCE(h.fast_count,   0)::int             AS fast_count
     FROM route_agg r
     FULL OUTER JOIN hunter_agg h ON r.did = h.did AND r.day = h.day`,
    [storeId, delivererId, hunterMinutes, windowDays]
  )
  return rows as DayMetricsRow[]
}

export function achievementsFromRow(row: DayMetricsRow, cfg: AchvConfig): EarnedAchievement[] {
  const out: EarnedAchievement[] = []
  if (row.routes_count >= cfg.routesTarget)
    out.push({ achievement: 'ROUTE_MASTER', target: cfg.routesTarget, metric: { routes: row.routes_count } })
  if (row.max_orders >= cfg.caravanOrders)
    out.push({ achievement: 'CARAVAN_CAPTAIN', target: cfg.caravanOrders, metric: { maxOrders: row.max_orders } })
  if (row.fast_count >= cfg.hunterCount)
    out.push({ achievement: 'ORDER_HUNTER', target: cfg.hunterCount, metric: { fastCount: row.fast_count, minutes: cfg.hunterMinutes } })
  return out
}

export function todayInTz(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}

// Conquistas de HOJE (ao vivo) de um entregador — não dependem do job.
export async function computeToday(storeId: string, delivererId: string, cfg: AchvConfig): Promise<EarnedAchievement[]> {
  const rows = await computeRange(storeId, delivererId, 2, cfg.hunterMinutes)
  const row = rows.find(r => r.day === todayInTz())
  return row ? achievementsFromRow(row, cfg) : []
}

// Persiste os dias JÁ CONCLUÍDOS (< hoje) de uma loja. ON CONFLICT DO NOTHING
// congela o snapshot da meta na primeira avaliação do dia.
export async function persistStore(storeId: string, windowDays: number): Promise<void> {
  const cfg = await getConfig(storeId)
  const rows = await computeRange(storeId, null, windowDays, cfg.hunterMinutes)
  const today = todayInTz()
  for (const row of rows) {
    if (row.day >= today) continue
    for (const a of achievementsFromRow(row, cfg)) {
      await db.query(
        `INSERT INTO deliverer_daily_achievements (store_id, deliverer_id, day, achievement, target, metric)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (deliverer_id, day, achievement) DO NOTHING`,
        [storeId, row.deliverer_id, row.day, a.achievement, a.target, JSON.stringify(a.metric)]
      )
    }
  }
}

// Job: avalia/persiste todas as lojas. windowDays pequeno no periódico; grande no backfill.
export async function runAchievementsJob(windowDays = 3): Promise<void> {
  const { rows } = await db.query(`SELECT id FROM stores`)
  for (const r of rows as { id: string }[]) {
    await persistStore(r.id, windowDays).catch(() => { /* non-fatal */ })
  }
}
