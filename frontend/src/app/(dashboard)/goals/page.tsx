'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Target, Plus, Pencil, Trash2, X, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'

type GoalType   = 'deliveries' | 'avg_rating' | 'cancellation_rate' | 'avg_delivery_time'
type GoalPeriod = 'daily' | 'weekly' | 'monthly'

interface Goal {
  id:       string
  type:     GoalType
  target:   number
  period:   GoalPeriod
  progress: number | null
}

interface DelivererWithGoals {
  id:       string
  name:     string
  username: string
  status:   string
  goals:    Goal[]
}

const TYPE_LABELS: Record<GoalType, string> = {
  deliveries:        'Entregas',
  avg_rating:        'Avaliação média',
  cancellation_rate: 'Taxa de cancelamento',
  avg_delivery_time: 'Tempo médio de entrega',
}

const TYPE_UNIT: Record<GoalType, string> = {
  deliveries:        '',
  avg_rating:        '★',
  cancellation_rate: '%',
  avg_delivery_time: 'min',
}

const PERIOD_LABELS: Record<GoalPeriod, string> = {
  daily:   'Diário',
  weekly:  'Semanal',
  monthly: 'Mensal',
}

const ALL_TYPES: GoalType[]   = ['deliveries', 'avg_rating', 'cancellation_rate', 'avg_delivery_time']
const ALL_PERIODS: GoalPeriod[] = ['daily', 'weekly', 'monthly']

// For cancellation_rate and avg_delivery_time, lower is better — progress bar logic is inverted
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
  AVAILABLE: 'bg-green-500',
  ON_ROUTE:  'bg-orange-500',
  OFFLINE:   'bg-gray-300',
}

export default function GoalsPage() {
  const router              = useRouter()
  const { can, isLoading }  = useAccess()

  useEffect(() => {
    if (isLoading) return
    if (!can({ scope: 'goals:view' })) router.replace('/orders')
  }, [isLoading, can, router])

  const { data: deliverers = [], mutate } = useSWR<DelivererWithGoals[]>(
    '/goals/deliverers',
    (u: string) => api.get<DelivererWithGoals[]>(u),
    { refreshInterval: 60_000 }
  )

  const canManage = can({ scope: 'goals:manage' })

  // Modal state
  const [editing, setEditing]   = useState<DelivererWithGoals | null>(null)
  const [formType,   setFormType]   = useState<GoalType>('deliveries')
  const [formPeriod, setFormPeriod] = useState<GoalPeriod>('monthly')
  const [formTarget, setFormTarget] = useState('')
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  if (isLoading || !can({ scope: 'goals:view' })) return null

  const openModal = (d: DelivererWithGoals) => {
    setEditing(d)
    setFormType('deliveries')
    setFormPeriod('monthly')
    setFormTarget('')
  }

  const closeModal = () => setEditing(null)

  const handleSave = async () => {
    if (!editing || !formTarget) return
    setSaving(true)
    try {
      await api.put(`/goals/deliverers/${editing.id}`, {
        type:   formType,
        target: Number(formTarget),
        period: formPeriod,
      })
      await mutate()
      setFormTarget('')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (goalId: string) => {
    setDeleting(goalId)
    try {
      await api.delete(`/goals/${goalId}`)
      await mutate()
    } finally {
      setDeleting(null)
    }
  }

  const deliverersWithGoals    = deliverers.filter(d => d.goals.length > 0)
  const deliverersWithoutGoals = deliverers.filter(d => d.goals.length === 0)

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-gray-400" />
            <h1 className="text-lg font-semibold text-gray-900">Metas de entregadores</h1>
          </div>
          <span className="text-sm text-gray-400">{deliverers.length} entregadores</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {deliverers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Target className="mb-3 h-12 w-12" />
            <p className="text-base font-medium">Nenhum entregador cadastrado</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Deliverers with goals */}
            {deliverersWithGoals.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[d.status] ?? 'bg-gray-300'}`} />
                    <span className="font-semibold text-gray-900">{d.name}</span>
                    <span className="text-xs text-gray-400">@{d.username}</span>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => openModal(d)}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar meta
                    </button>
                  )}
                </div>

                <div className="divide-y divide-gray-50">
                  {d.goals.map((g) => {
                    const pct   = progressPct(g)
                    const unit  = TYPE_UNIT[g.type]
                    const lower = isLowerBetter(g.type)
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
                              {g.progress !== null ? `${g.progress}${unit}` : '—'}
                              {' / '}
                              <span className="font-medium text-gray-700">{g.target}{unit}</span>
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        {canManage && (
                          <button
                            onClick={() => handleDelete(g.id)}
                            disabled={deleting === g.id}
                            className="shrink-0 rounded-lg p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Deliverers without goals */}
            {canManage && deliverersWithoutGoals.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Sem metas ({deliverersWithoutGoals.length})
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {deliverersWithoutGoals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => openModal(d)}
                      className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 px-4 py-3 text-left hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
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
      </div>

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Adicionar meta</h2>
                <p className="mt-0.5 text-xs text-gray-400">{editing.name}</p>
              </div>
              <button onClick={closeModal} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              {/* Type */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Tipo de meta</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setFormType(t)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        formType === t
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">Período</label>
                <div className="flex gap-2">
                  {ALL_PERIODS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setFormPeriod(p)}
                      className={`flex-1 rounded-lg border py-2 text-sm transition-colors ${
                        formPeriod === p
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-500">
                  Valor alvo{TYPE_UNIT[formType] ? ` (${TYPE_UNIT[formType]})` : ''}
                  {isLowerBetter(formType) && <span className="ml-1 text-amber-500">— menor é melhor</span>}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  placeholder={formType === 'avg_rating' ? 'Ex: 4.5' : formType === 'cancellation_rate' ? 'Ex: 5' : 'Ex: 20'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Existing goals for this deliverer */}
              {editing.goals.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium text-gray-400">Metas existentes</p>
                  <div className="space-y-1.5">
                    {editing.goals.map((g) => (
                      <div key={g.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                        <span className="text-xs text-gray-600">
                          {TYPE_LABELS[g.type]} · {PERIOD_LABELS[g.period]} · <strong>{g.target}{TYPE_UNIT[g.type]}</strong>
                        </span>
                        <button
                          onClick={() => handleDelete(g.id)}
                          disabled={deleting === g.id}
                          className="text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
              <button
                onClick={closeModal}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formTarget}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Salvar meta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
