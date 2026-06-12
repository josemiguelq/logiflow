import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireDeliverer } from '../../../shared/middleware/auth'
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

export async function gamificationRoutes(app: FastifyInstance) {
  // Tela de conquistas do entregador.
  app.get('/deliverer/achievements', { preHandler: requireDeliverer }, async (req) => {
    const { month } = z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    }).parse(req.query)

    const storeId = req.actor.storeId
    const delivererId = req.actor.sub
    const cfg = await getConfig(storeId)
    const today = todayInTz()
    const targetMonth = month ?? today.slice(0, 7)

    // Histórico persistido (dias < hoje) — fonte de verdade para streaks/stats.
    const { rows: persisted } = await db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, achievement
       FROM deliverer_daily_achievements
       WHERE deliverer_id = $1`,
      [delivererId]
    )

    // day -> Set<achievement>
    const byDay = new Map<string, Set<AchievementKey>>()
    const add = (day: string, a: AchievementKey) => {
      if (!byDay.has(day)) byDay.set(day, new Set())
      byDay.get(day)!.add(a)
    }
    for (const r of persisted as { day: string; achievement: AchievementKey }[]) {
      if (r.day < today) add(r.day, r.achievement)
    }
    // Hoje ao vivo
    const todayEarned = await computeToday(storeId, delivererId, cfg)
    for (const e of todayEarned) add(today, e.achievement)

    // Dias (ordenados) em que cada conquista foi obtida.
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
      // melhor ofensiva = maior sequência de dias consecutivos
      let best = 0, run = 0, prev: string | null = null
      for (const d of days) {
        run = prev && addDays(prev, 1) === d ? run + 1 : 1
        if (run > best) best = run
        prev = d
      }
      // ofensiva atual = sequência terminando em hoje (se obteve hoje) ou ontem
      let cursor = set.has(today) ? today : addDays(today, -1)
      let current = 0
      while (set.has(cursor)) { current++; cursor = addDays(cursor, -1) }
      stats[a] = { totalDays: days.length, bestStreak: best, currentStreak: current }
      streaks[a] = current
    }

    // Calendário do mês pedido.
    const calendar = [...byDay.entries()]
      .filter(([day]) => day.startsWith(targetMonth))
      .map(([day, set]) => ({ day, achievements: [...set] }))
      .sort((x, y) => x.day.localeCompare(y.day))

    return {
      month: targetMonth,
      today,
      config: cfg,
      streaks,
      stats,
      calendar,
    }
  })

  // Detalhe de um dia (modal): conquistas + métrica + meta (snapshot no passado).
  app.get('/deliverer/achievements/day', { preHandler: requireDeliverer }, async (req) => {
    const { date } = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query)

    const storeId = req.actor.storeId
    const delivererId = req.actor.sub
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
  })
}
