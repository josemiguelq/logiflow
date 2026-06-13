'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Target, Plus, Trash2, X, Check, Trophy, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { StoreAchievementsCalendar } from '@/components/achievements/achievements-panel'

// ───────────────────────── Metas individuais (existente) ─────────────────────
type GoalType   = 'deliveries' | 'avg_rating' | 'cancellation_rate' | 'avg_delivery_time'
type GoalPeriod = 'daily' | 'weekly' | 'monthly'

interface Goal {
  id: string; type: GoalType; target: number; period: GoalPeriod; progress: number | null
}
interface DelivererWithGoals {
  id: string; name: string; username: string; status: string; goals: Goal[]
}

const TYPE_LABELS: Record<GoalType, string> = {
  deliveries: 'Entregas', avg_rating: 'Avaliação média',
  cancellation_rate: 'Taxa de cancelamento', avg_delivery_time: 'Tempo médio de entrega',
}
const TYPE_UNIT: Record<GoalType, string> = {
  deliveries: '', avg_rating: '★', cancellation_rate: '%', avg_delivery_time: 'min',
}
const PERIOD_LABELS: Record<GoalPeriod, string> = { daily: 'Diário', weekly: 'Semanal', monthly: 'Mensal' }
const ALL_TYPES: GoalType[]   = ['deliveries', 'avg_rating', 'cancellation_rate', 'avg_delivery_time']
const ALL_PERIODS: GoalPeriod[] = ['daily', 'weekly', 'monthly']

function isLowerBetter(type: GoalType) {
  return type === 'cancellation_rate' || type === 'avg_delivery_time'
}
function progressPct(goal: Goal): number {
  if (goal.progress === null) return 0
  if (isLowerBetter(goal.type)) {
    if (goal.progress <= goal.target) return 100
    return Math.max(0, Math.round((1 - (goal.progress - goal.target) / goal.target) * 100))
  }
  return Math.min(100, Math.round((goal.progress / goal.target) * 100))
}
function progressColor(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 60)  return 'bg-blue-500'
  if (pct >= 30)  return 'bg-yellow-400'
  return 'bg-red-400'
}
const STATUS_DOT: Record<string, string> = {
  AVAILABLE: 'bg-green-500', ON_ROUTE: 'bg-orange-500', OFFLINE: 'bg-gray-300',
}

// ───────────────────────── Conquistas (gamificação) ──────────────────────────
interface AchvConfig { routesTarget: number; caravanOrders: number; hunterMinutes: number; hunterCount: number }

export default function GoalsPage() {
  const router             = useRouter()
  const { can, isLoading } = useAccess()

  useEffect(() => {
    if (isLoading) return
    if (!can({ scope: 'goals:view' })) router.replace('/orders')
  }, [isLoading, can, router])

  const canManage = can({ scope: 'goals:manage' })

  const { data: deliverers = [], mutate } = useSWR<DelivererWithGoals[]>(
    '/goals/deliverers',
    (u: string) => api.get<DelivererWithGoals[]>(u),
    { refreshInterval: 60_000 }
  )

  // Metas individuais (modal)
  const [editing, setEditing]   = useState<DelivererWithGoals | null>(null)
  const [formType,   setFormType]   = useState<GoalType>('deliveries')
  const [formPeriod, setFormPeriod] = useState<GoalPeriod>('monthly')
  const [formTarget, setFormTarget] = useState('')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  if (isLoading || !can({ scope: 'goals:view' })) return null

  const openModal = (d: DelivererWithGoals) => {
    setEditing(d); setFormType('deliveries'); setFormPeriod('monthly'); setFormTarget('')
  }
  const handleSave = async () => {
    if (!editing || !formTarget) return
    setSaving(true)
    try {
      await api.put(`/goals/deliverers/${editing.id}`, { type: formType, target: Number(formTarget), period: formPeriod })
      await mutate(); setFormTarget('')
    } finally { setSaving(false) }
  }
  const handleDelete = async (goalId: string) => {
    setDeleting(goalId)
    try { await api.delete(`/goals/${goalId}`); await mutate() } finally { setDeleting(null) }
  }

  const deliverersWithGoals    = deliverers.filter(d => d.goals.length > 0)
  const deliverersWithoutGoals = deliverers.filter(d => d.goals.length === 0)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-gray-400" />
          <h1 className="text-lg font-semibold text-gray-900">Metas</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-10">

          {/* ───── 1. Metas da loja (gamificação) ───── */}
          <StoreAchievementsConfig canManage={canManage} />

          {/* ───── 2. Conquistas dos entregadores ───── */}
          <section>
            <div className="mb-1 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-semibold text-gray-900">Conquistas dos entregadores</h2>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Calendário comparativo: cada dia mostra os entregadores que bateram conquistas e quais.
            </p>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <StoreAchievementsCalendar />
            </div>
          </section>

          {/* ───── 3. Metas individuais ───── */}
          <section>
            <div className="mb-1 flex items-center gap-2">
              <Target className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Metas individuais</h2>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Metas de desempenho por entregador (entregas, avaliação, etc.), com acompanhamento de progresso.
            </p>

            {deliverers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Target className="mb-3 h-10 w-10" />
                <p className="text-sm font-medium">Nenhum entregador cadastrado</p>
              </div>
            ) : (
              <div className="space-y-6">
                {deliverersWithGoals.map((d) => (
                  <div key={d.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[d.status] ?? 'bg-gray-300'}`} />
                        <span className="font-semibold text-gray-900">{d.name}</span>
                        <span className="text-xs text-gray-400">@{d.username}</span>
                      </div>
                      {canManage && (
                        <button onClick={() => openModal(d)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                          <Plus className="h-3.5 w-3.5" /> Adicionar meta
                        </button>
                      )}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {d.goals.map((g) => {
                        const pct = progressPct(g); const unit = TYPE_UNIT[g.type]; const lower = isLowerBetter(g.type)
                        return (
                          <div key={g.id} className="flex items-center gap-4 px-5 py-3.5">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-800">{TYPE_LABELS[g.type]}</span>
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{PERIOD_LABELS[g.period]}</span>
                                  {lower && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">menor é melhor</span>}
                                </div>
                                <span className="shrink-0 text-xs text-gray-500">
                                  {g.progress !== null ? `${g.progress}${unit}` : '—'} {' / '}
                                  <span className="font-medium text-gray-700">{g.target}{unit}</span>
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                                <div className={`h-full rounded-full transition-all ${progressColor(pct)}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            {canManage && (
                              <button onClick={() => handleDelete(g.id)} disabled={deleting === g.id}
                                className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors">
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {canManage && deliverersWithoutGoals.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                      Sem metas ({deliverersWithoutGoals.length})
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {deliverersWithoutGoals.map((d) => (
                        <button key={d.id} onClick={() => openModal(d)}
                          className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[d.status] ?? 'bg-gray-300'}`} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-700">{d.name}</p>
                            <p className="text-xs text-gray-400">Definir metas</p>
                          </div>
                          <Plus className="ml-auto h-4 w-4 shrink-0 text-gray-300" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modal de meta individual */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adicionar meta</h2>
                <p className="mt-0.5 text-xs text-gray-400">{editing.name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Tipo de meta</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_TYPES.map((t) => (
                    <button key={t} onClick={() => setFormType(t)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        formType === t ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Período</label>
                <div className="flex gap-2">
                  {ALL_PERIODS.map((p) => (
                    <button key={p} onClick={() => setFormPeriod(p)}
                      className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                        formPeriod === p ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}>
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Valor alvo{TYPE_UNIT[formType] ? ` (${TYPE_UNIT[formType]})` : ''}
                  {isLowerBetter(formType) && <span className="ml-1 text-amber-500">— menor é melhor</span>}
                </label>
                <input type="number" min="0" step="any" value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  placeholder={formType === 'avg_rating' ? 'Ex: 4.5' : formType === 'cancellation_rate' ? 'Ex: 5' : 'Ex: 20'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
              {editing.goals.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-400">Metas existentes</p>
                  <div className="space-y-1.5">
                    {editing.goals.map((g) => (
                      <div key={g.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-600">
                          {TYPE_LABELS[g.type]} · {PERIOD_LABELS[g.period]} · <strong>{g.target}{TYPE_UNIT[g.type]}</strong>
                        </span>
                        <button onClick={() => handleDelete(g.id)} disabled={deleting === g.id}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={() => setEditing(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                Fechar
              </button>
              <button onClick={handleSave} disabled={saving || !formTarget}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-4 w-4" />}
                Salvar meta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ───────────────────────── Seção 1: config da loja ───────────────────────────
function StoreAchievementsConfig({ canManage }: { canManage: boolean }) {
  const { data, mutate } = useSWR<AchvConfig>(
    '/store/achievement-config', (u: string) => api.get<AchvConfig>(u)
  )
  const [routes, setRoutes]   = useState(5)
  const [caravan, setCaravan] = useState(8)
  const [minutes, setMinutes] = useState(10)
  const [count, setCount]     = useState(3)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    if (data) {
      setRoutes(data.routesTarget); setCaravan(data.caravanOrders)
      setMinutes(data.hunterMinutes); setCount(data.hunterCount)
    }
  }, [data])

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await api.put('/store/achievement-config', {
        routesTarget: routes, caravanOrders: caravan, hunterMinutes: minutes, hunterCount: count,
      })
      await mutate(); setSaved(true); setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const num = (v: number, set: (n: number) => void, max: number) => (
    <input type="number" min={1} max={max} value={v} disabled={!canManage}
      onChange={(e) => set(Math.max(1, Math.min(max, Number(e.target.value) || 0)))}
      className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-center text-sm outline-none focus:border-blue-500 disabled:bg-gray-50" />
  )

  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h2 className="text-base font-semibold text-gray-900">Metas da loja · Conquistas</h2>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Conquistas diárias de gamificação que aparecem no app dos entregadores. Valem para
        <strong> todos os entregadores</strong> da loja e renovam a cada dia.
      </p>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-4">
          {/* Mestre das Rotas */}
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚚</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Mestre das Rotas</p>
              <p className="mt-0.5 text-sm text-gray-600">
                Concluir {num(routes, setRoutes, 100)} ou mais <strong>rotas</strong> no dia.
              </p>
            </div>
          </div>
          {/* Capitão da Caravana */}
          <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
            <span className="text-2xl">📦</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Capitão da Caravana</p>
              <p className="mt-0.5 text-sm text-gray-600">
                Fazer ao menos uma <strong>rota com {num(caravan, setCaravan, 100)} ou mais pedidos</strong>.
              </p>
            </div>
          </div>
          {/* Caçador de Pedidos */}
          <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
            <span className="text-2xl">⚡</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Caçador de Pedidos</p>
              <p className="mt-0.5 text-sm text-gray-600">
                Aceitar {num(count, setCount, 100)} pedidos em até {num(minutes, setMinutes, 600)} minutos da criação
                — premia quem pega pedidos rápido.
              </p>
            </div>
          </div>
        </div>

        {canManage && (
          <div className="mt-5 flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Salvando…' : 'Salvar metas'}
            </button>
            {saved && <span className="text-sm text-green-600">Metas salvas ✓</span>}
          </div>
        )}
      </div>
    </section>
  )
}

