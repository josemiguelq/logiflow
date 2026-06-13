'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { X } from 'lucide-react'
import { api } from '@/lib/api'

const ACHV_ORDER = ['ROUTE_MASTER', 'CARAVAN_CAPTAIN', 'ORDER_HUNTER'] as const
type AchvKey = typeof ACHV_ORDER[number]
const ACHV: Record<AchvKey, { emoji: string; name: string }> = {
  ROUTE_MASTER:    { emoji: '🚚', name: 'Mestre das Rotas' },
  CARAVAN_CAPTAIN: { emoji: '📦', name: 'Capitão da Caravana' },
  ORDER_HUNTER:    { emoji: '⚡', name: 'Caçador de Pedidos' },
}

interface AchvStat { totalDays: number; bestStreak: number; currentStreak: number }
interface AchvData {
  month: string; today: string
  streaks: Record<string, number>
  stats: Record<string, AchvStat>
  calendar: { day: string; achievements: string[] }[]
}
interface DayDetail {
  date: string
  achievements: { achievement: AchvKey; target: number; metric: Record<string, number> }[]
}

function metricLabel(key: AchvKey, target: number, m: Record<string, number>): string {
  switch (key) {
    case 'ROUTE_MASTER':    return `${m.routes} rotas concluídas · meta ${target}`
    case 'CARAVAN_CAPTAIN': return `Rota com ${m.maxOrders} pedidos · meta ${target}`
    case 'ORDER_HUNTER':    return `${m.fastCount} pedido(s) aceito(s) em < ${m.minutes} min · meta ${target}`
  }
}

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const monthLabel = (k: string) => { const [y, m] = k.split('-'); return `${MONTH_NAMES[(Number(m) - 1)] ?? ''} ${y}` }

// Calendário + ofensivas + estatísticas das conquistas de um entregador.
export function AchievementsPanel({ delivererId }: { delivererId: string }) {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i); return monthKey(d)
  })
  const [month, setMonth] = useState(months[0])
  const [dayDate, setDayDate] = useState<string | null>(null)

  const { data } = useSWR<AchvData>(
    delivererId ? `/store/achievements?delivererId=${delivererId}&month=${month}` : null,
    (u: string) => api.get<AchvData>(u)
  )
  const byDay = new Map((data?.calendar ?? []).map(c => [c.day, c.achievements]))

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* ofensivas atuais */}
        <div className="flex flex-wrap gap-2">
          {ACHV_ORDER.map(k => (
            <span key={k} className="inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1 text-sm">
              <span>{ACHV[k].emoji}</span>
              <span className="font-semibold text-gray-800">{data?.streaks[k] ?? 0}</span>
              <span className="text-gray-500">dias</span>
            </span>
          ))}
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <MonthGrid month={month} today={data?.today ?? ''} byDay={byDay} onTapDay={setDayDate} />

      {data && (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {ACHV_ORDER.map(k => {
            const s = data.stats[k] ?? { totalDays: 0, bestStreak: 0, currentStreak: 0 }
            return (
              <div key={k} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-sm font-medium text-gray-800">{ACHV[k].emoji} {ACHV[k].name}</p>
                <div className="flex justify-between text-center text-xs text-gray-500">
                  <div><p className="text-base font-bold text-gray-900">{s.totalDays}</p>dias</div>
                  <div><p className="text-base font-bold text-gray-900">{s.bestStreak}</p>melhor</div>
                  <div><p className="text-base font-bold text-gray-900">{s.currentStreak}</p>atual</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {dayDate && delivererId && (
        <DayDetailModal delivererId={delivererId} date={dayDate} onClose={() => setDayDate(null)} />
      )}
    </div>
  )
}

// ── Calendário da loja: por dia, os entregadores e suas conquistas ───────────
interface StoreCalDay { day: string; deliverers: { id: string; name: string; achievements: string[] }[] }
interface StoreCal { month: string; today: string; days: StoreCalDay[] }

export function StoreAchievementsCalendar() {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - i); return monthKey(d)
  })
  const [month, setMonth] = useState(months[0])
  const { data } = useSWR<StoreCal>(
    `/store/achievements/calendar?month=${month}`,
    (u: string) => api.get<StoreCal>(u)
  )
  const byDay = new Map((data?.days ?? []).map(d => [d.day, d.deliverers]))

  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstWeekday = new Date(y, m - 1, 1).getDay()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          {ACHV_ORDER.map(k => (
            <span key={k}>{ACHV[k].emoji} {ACHV[k].name}</span>
          ))}
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500">
          {months.map(mm => <option key={mm} value={mm}>{monthLabel(mm)}</option>)}
        </select>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
        {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const delivs = byDay.get(date) ?? []
          const isToday = date === (data?.today ?? '')
          return (
            <div key={i}
              className={`min-h-[68px] rounded-lg border p-1 ${
                isToday ? 'border-blue-500' : 'border-gray-100'} ${delivs.length ? 'bg-blue-50/40' : 'bg-transparent'}`}>
              <div className="mb-0.5 text-[11px] font-semibold text-gray-500">{Number(date.slice(-2))}</div>
              <div className="space-y-0.5">
                {delivs.map(dv => (
                  <div key={dv.id} className="flex items-center gap-1 text-[10px] leading-tight" title={dv.name}>
                    <span className="min-w-0 flex-1 truncate text-gray-700">{dv.name.split(' ')[0]}</span>
                    <span className="shrink-0">{dv.achievements.map(a => ACHV[a as AchvKey]?.emoji).join('')}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthGrid({ month, today, byDay, onTapDay }: {
  month: string; today: string; byDay: Map<string, string[]>; onTapDay: (d: string) => void
}) {
  const [y, m] = month.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const firstWeekday = new Date(y, m - 1, 1).getDay()
  const cells: (string | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-gray-400">
        {['D','S','T','Q','Q','S','S'].map((w, i) => <div key={i}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />
          const achvs = byDay.get(date) ?? []
          const has = achvs.length > 0
          const isToday = date === today
          return (
            <button key={i} disabled={!has} onClick={() => onTapDay(date)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                isToday ? 'border-blue-500' : 'border-gray-100'} ${has ? 'bg-blue-50/60 hover:bg-blue-100' : 'bg-transparent'}`}>
              <span className={has ? 'font-semibold text-gray-800' : 'text-gray-400'}>{Number(date.slice(-2))}</span>
              <span className="text-[10px] leading-none">{achvs.map(a => ACHV[a as AchvKey]?.emoji).join('')}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayDetailModal({ delivererId, date, onClose }: { delivererId: string; date: string; onClose: () => void }) {
  const { data } = useSWR<DayDetail>(
    `/store/achievements/day?delivererId=${delivererId}&date=${date}`,
    (u: string) => api.get<DayDetail>(u)
  )
  const pretty = date.split('-').reverse().join('/')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">{pretty}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        {!data ? (
          <p className="py-4 text-center text-sm text-gray-400">Carregando…</p>
        ) : data.achievements.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">Nenhuma conquista neste dia.</p>
        ) : (
          <div className="space-y-3">
            {data.achievements.map((a) => (
              <div key={a.achievement} className="flex items-start gap-3">
                <span className="text-xl">{ACHV[a.achievement].emoji}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{ACHV[a.achievement].name}</p>
                  <p className="text-xs text-gray-600">{metricLabel(a.achievement, a.target, a.metric)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
