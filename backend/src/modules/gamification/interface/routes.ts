import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { invalidateStoreSettings } from '../../settings/store-settings-cache'
import { requireDeliverer, requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import {
  ACHIEVEMENTS, AchievementKey, EarnedAchievement,
  getConfig, computeToday, todayInTz,
} from '../application/service'

// 'YYYY-MM-DD' + n dias (em UTC, evita drift de fuso na aritmética de calendário).
function addDays(day: string, n: number): string {
  const dt = new Date(day + 'T00:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

// Monta o payload da tela (streaks, stats, calendário) para um entregador.
async function buildAchievementsPayload(storeId: string, delivererId: string, month?: string) {
  const cfg = await getConfig(storeId)
  const today = todayInTz()
  const targetMonth = month ?? today.slice(0, 7)

  const { rows: persisted } = await db.query(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, achievement
     FROM deliverer_daily_achievements
     WHERE deliverer_id = $1`,
    [delivererId]
  )

  const byDay = new Map<string, Set<AchievementKey>>()
  const add = (day: string, a: AchievementKey) => {
    if (!byDay.has(day)) byDay.set(day, new Set())
    byDay.get(day)!.add(a)
  }
  for (const r of persisted as { day: string; achievement: AchievementKey }[]) {
    if (r.day < today) add(r.day, r.achievement)
  }
  const todayEarned = await computeToday(storeId, delivererId, cfg)
  for (const e of todayEarned) add(today, e.achievement)

  const daysByAchv: Record<AchievementKey, string[]> = {
    ROUTE_MASTER: [], CARAVAN_CAPTAIN: [], ORDER_HUNTER: [],
  }
  for (const [day, set] of byDay) for (const a of set) daysByAchv[a].push(day)
  for (const a of ACHIEVEMENTS) daysByAchv[a].sort()

  const stats: Record<string, { totalDays: number; bestStreak: number; currentStreak: number }> = {}
  const streaks: Record<string, number> = {}
  for (const a of ACHIEVEMENTS) {
    const days = daysByAchv[a]
    const set = new Set(days)
    let best = 0, run = 0, prev: string | null = null
    for (const d of days) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1
      if (run > best) best = run
      prev = d
    }
    let cursor = set.has(today) ? today : addDays(today, -1)
    let current = 0
    while (set.has(cursor)) { current++; cursor = addDays(cursor, -1) }
    stats[a] = { totalDays: days.length, bestStreak: best, currentStreak: current }
    streaks[a] = current
  }

  const calendar = [...byDay.entries()]
    .filter(([day]) => day.startsWith(targetMonth))
    .map(([day, set]) => ({ day, achievements: [...set] }))
    .sort((x, y) => x.day.localeCompare(y.day))

  return { month: targetMonth, today, config: cfg, streaks, stats, calendar }
}

// Detalhe de um dia (conquistas + métrica + meta). Hoje ao vivo; passado da tabela.
async function buildDayDetail(storeId: string, delivererId: string, date: string) {
  const today = todayInTz()
  let achievements: EarnedAchievement[]
  if (date === today) {
    achievements = await computeToday(storeId, delivererId, await getConfig(storeId))
  } else {
    const { rows } = await db.query(
      `SELECT achievement, target, metric
       FROM deliverer_daily_achievements
       WHERE deliverer_id = $1 AND day = $2::date`,
      [delivererId, date]
    )
    achievements = (rows as { achievement: AchievementKey; target: string; metric: Record<string, number> }[])
      .map(r => ({ achievement: r.achievement, target: Number(r.target), metric: r.metric }))
  }
  return { date, achievements }
}

async function delivererInStore(delivererId: string, storeId: string): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM deliverers WHERE id = $1 AND store_id = $2', [delivererId, storeId]
  )
  return rows.length > 0
}

export async function gamificationRoutes(app: FastifyInstance) {
  // ── App do entregador ──────────────────────────────────────────────────────
  app.get('/deliverer/achievements', { preHandler: requireDeliverer }, async (req) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query)
    return buildAchievementsPayload(req.actor.storeId, req.actor.sub, month)
  })

  app.get('/deliverer/achievements/day', { preHandler: requireDeliverer }, async (req) => {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query)
    return buildDayDetail(req.actor.storeId, req.actor.sub, date)
  })

  // ── Painel da loja (Metas) ─────────────────────────────────────────────────
  const storeGuard = [requireStoreUser, requireScope('goals:view')]

  app.get('/store/achievements', { preHandler: storeGuard }, async (req, reply) => {
    const { delivererId, month } = z.object({
      delivererId: z.string().uuid(),
      month:       z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(req.query)
    if (!await delivererInStore(delivererId, req.actor.storeId)) {
      return reply.code(404).send({ error: 'Entregador não encontrado' })
    }
    return buildAchievementsPayload(req.actor.storeId, delivererId, month)
  })

  app.get('/store/achievements/day', { preHandler: storeGuard }, async (req, reply) => {
    const { delivererId, date } = z.object({
      delivererId: z.string().uuid(),
      date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query)
    if (!await delivererInStore(delivererId, req.actor.storeId)) {
      return reply.code(404).send({ error: 'Entregador não encontrado' })
    }
    return buildDayDetail(req.actor.storeId, delivererId, date)
  })

  // Calendário da loja: por dia, quais entregadores tiveram conquistas e quais.
  app.get('/store/achievements/calendar', { preHandler: storeGuard }, async (req) => {
    const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(req.query)
    const storeId = req.actor.storeId
    const today = todayInTz()
    const targetMonth = month ?? today.slice(0, 7)

    // day -> delivererId -> { name, achievements:Set }
    const byDay = new Map<string, Map<string, { name: string; achievements: Set<string> }>>()
    const add = (day: string, id: string, name: string, achv: string) => {
      if (!byDay.has(day)) byDay.set(day, new Map())
      const m = byDay.get(day)!
      if (!m.has(id)) m.set(id, { name, achievements: new Set() })
      m.get(id)!.achievements.add(achv)
    }

    // Dias concluídos (persistidos) do mês.
    const { rows: persisted } = await db.query(
      `SELECT to_char(dda.day, 'YYYY-MM-DD') AS day, dda.deliverer_id, d.name, dda.achievement
       FROM deliverer_daily_achievements dda
       JOIN deliverers d ON d.id = dda.deliverer_id
       WHERE dda.store_id = $1 AND to_char(dda.day, 'YYYY-MM') = $2 AND dda.day < $3::date`,
      [storeId, targetMonth, today]
    )
    for (const r of persisted as { day: string; deliverer_id: string; name: string; achievement: string }[]) {
      add(r.day, r.deliverer_id, r.name, r.achievement)
    }

    // Hoje ao vivo (só se o mês pedido é o atual).
    if (targetMonth === today.slice(0, 7)) {
      const cfg = await getConfig(storeId)
      const { rows: delivs } = await db.query(
        `SELECT id, name FROM deliverers WHERE store_id = $1 AND is_active = true`, [storeId]
      )
      for (const dv of delivs as { id: string; name: string }[]) {
        const earned = await computeToday(storeId, dv.id, cfg)
        for (const e of earned) add(today, dv.id, dv.name, e.achievement)
      }
    }

    const days = [...byDay.entries()]
      .map(([day, m]) => ({
        day,
        deliverers: [...m.entries()].map(([id, v]) => ({ id, name: v.name, achievements: [...v.achievements] })),
      }))
      .sort((a, b) => a.day.localeCompare(b.day))

    return { month: targetMonth, today, days }
  })

  // Config das metas da loja (X/Y/Z/N) — leitura e escrita pela tela de Metas.
  app.get('/store/achievement-config', { preHandler: storeGuard }, async (req) =>
    getConfig(req.actor.storeId)
  )

  app.put(
    '/store/achievement-config',
    { preHandler: [requireStoreUser, requireScope('goals:manage')] },
    async (req) => {
      const body = z.object({
        routesTarget:  z.number().int().min(1).max(100),
        caravanOrders: z.number().int().min(1).max(100),
        hunterMinutes: z.number().int().min(1).max(600),
        hunterCount:   z.number().int().min(1).max(100),
      }).parse(req.body)

      const map: [string, number][] = [
        ['achv_routes_target',  body.routesTarget],
        ['achv_caravan_orders', body.caravanOrders],
        ['achv_hunter_minutes', body.hunterMinutes],
        ['achv_hunter_count',   body.hunterCount],
      ]
      for (const [name, value] of map) {
        await db.query(
          `INSERT INTO store_setting_values (store_id, setting_id, value)
           SELECT $1, id, $2 FROM settings WHERE name = $3
           ON CONFLICT (store_id, setting_id) DO UPDATE SET value = EXCLUDED.value`,
          [req.actor.storeId, String(value), name]
        )
      }
      await invalidateStoreSettings(req.actor.storeId)
      return getConfig(req.actor.storeId)
    }
  )
}
