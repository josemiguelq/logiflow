'use client'

import { use, useState, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Wifi, WifiOff, Truck, Star, CalendarClock, Coffee, Save } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAccess } from '@/hooks/useAccess'
import { AchievementsPanel } from '@/components/achievements/achievements-panel'
import type { DaySchedule, Punctuality } from '@/types'

interface StatusEntry {
  status:    string
  lat:       number | null
  lng:       number | null
  changedAt: string
}

interface DelivererDetail {
  id:              string
  name:            string
  username:        string
  email:           string | null
  status:          string
  profileImageUrl: string | null
  isActive:        boolean
  createdAt:       string
  avgRating:       number | null
  ratingCount:     number
  schedule:        DaySchedule[]
  punctuality:     Punctuality
  history:         StatusEntry[]
}

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

const PUNCTUALITY_STYLE: Record<Punctuality['state'], { label: string; color: string; bg: string }> = {
  on_time: { label: 'No horário', color: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
  early:   { label: 'Adiantado',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  late:    { label: 'Atrasado',   color: 'text-red-700',    bg: 'bg-red-50 border-red-200' },
  absent:  { label: 'Não marcou', color: 'text-gray-600',   bg: 'bg-gray-100 border-gray-200' },
  off:     { label: 'Folga',      color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
}

function PunctualityCard({ p }: { p: Punctuality }) {
  const s = PUNCTUALITY_STYLE[p.state]
  const diffLabel = p.diffMin == null || p.diffMin === 0
    ? null
    : `${Math.abs(p.diffMin)} min ${p.diffMin > 0 ? 'atrasado' : 'adiantado'}`
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {p.state === 'off' ? (
            <span>Hoje é folga (sem horário combinado).</span>
          ) : (
            <span>
              Combinado <strong>{p.scheduledStart ?? '—'}</strong>
              {' · '}
              marcou Disponível <strong>{fmtTime(p.firstAvailableAt)}</strong>
            </span>
          )}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.color} ${s.bg}`}>
          {s.label}{diffLabel ? ` · ${diffLabel}` : ''}
        </span>
      </div>
    </div>
  )
}

const emptyDay = (dow: number): DaySchedule => ({
  dayOfWeek: dow, active: false, startTime: '08:00', endTime: '18:00',
})

function toWeek(days: DaySchedule[]): DaySchedule[] {
  return Array.from({ length: 7 }, (_, dow) => days.find(d => d.dayOfWeek === dow) ?? emptyDay(dow))
}

function WorkScheduleSection({ delivererId, canEdit }: { delivererId: string; canEdit: boolean }) {
  const { data, mutate } = useSWR<{ days: DaySchedule[] }>(
    `/deliverers/${delivererId}/schedule`,
    (u: string) => api.get<{ days: DaySchedule[] }>(u)
  )
  const [week, setWeek] = useState<DaySchedule[]>(toWeek([]))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { if (data) setWeek(toWeek(data.days)) }, [data])

  function patchDay(dow: number, patch: Partial<DaySchedule>) {
    setSaved(false)
    setWeek(w => w.map(d => (d.dayOfWeek === dow ? { ...d, ...patch } : d)))
  }

  function toggleLunch(dow: number, on: boolean) {
    patchDay(dow, on ? { lunchStart: '12:00', lunchEnd: '13:00' } : { lunchStart: undefined, lunchEnd: undefined })
  }

  async function handleSave() {
    setLoading(true); setError(''); setSaved(false)
    try {
      await api.put(`/deliverers/${delivererId}/schedule`, { days: week })
      await mutate()
      setSaved(true)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
          <CalendarClock className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-semibold text-gray-900">Horário de trabalho</h2>
      </div>

      <div className="space-y-2 p-4">
        {week.map(d => {
          const hasLunch = d.lunchStart != null
          return (
            <div key={d.dayOfWeek} className={`rounded-xl border p-3 ${d.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${d.active ? 'text-gray-900' : 'text-gray-400'}`}>{DAY_LABELS[d.dayOfWeek]}</span>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => patchDay(d.dayOfWeek, { active: !d.active })}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-60"
                  style={{ background: d.active ? 'var(--color-primary)' : '#E5E7EB' }}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${d.active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {d.active && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <input type="time" disabled={!canEdit} value={d.startTime}
                      onChange={e => patchDay(d.dayOfWeek, { startTime: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 disabled:bg-gray-50" />
                    <span className="text-gray-400">até</span>
                    <input type="time" disabled={!canEdit} value={d.endTime}
                      onChange={e => patchDay(d.dayOfWeek, { endTime: e.target.value })}
                      className="rounded-lg border border-gray-200 px-2 py-1 disabled:bg-gray-50" />
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <button type="button" disabled={!canEdit} onClick={() => toggleLunch(d.dayOfWeek, !hasLunch)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs disabled:opacity-60 ${hasLunch ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500'}`}>
                      <Coffee className="h-3.5 w-3.5" />
                      Almoço
                    </button>
                    {hasLunch && (
                      <>
                        <input type="time" disabled={!canEdit} value={d.lunchStart}
                          onChange={e => patchDay(d.dayOfWeek, { lunchStart: e.target.value })}
                          className="rounded-lg border border-gray-200 px-2 py-1 disabled:bg-gray-50" />
                        <span className="text-gray-400">até</span>
                        <input type="time" disabled={!canEdit} value={d.lunchEnd}
                          onChange={e => patchDay(d.dayOfWeek, { lunchEnd: e.target.value })}
                          className="rounded-lg border border-gray-200 px-2 py-1 disabled:bg-gray-50" />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {saved && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-600">Horário salvo</p>}

        {canEdit && (
          <button onClick={handleSave} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            style={{ background: 'var(--color-primary)' }}>
            <Save className="h-4 w-4" />
            {loading ? 'Salvando...' : 'Salvar horário'}
          </button>
        )}
      </div>
    </div>
  )
}

const STATUS_STYLE: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  AVAILABLE: {
    label: 'Disponível',
    icon:  <Wifi className="h-4 w-4" />,
    color: 'text-green-700',
    bg:    'bg-green-50 border-green-200',
  },
  ON_ROUTE: {
    label: 'Em rota',
    icon:  <Truck className="h-4 w-4" />,
    color: 'text-orange-700',
    bg:    'bg-orange-50 border-orange-200',
  },
  OFFLINE: {
    label: 'Offline',
    icon:  <WifiOff className="h-4 w-4" />,
    color: 'text-gray-600',
    bg:    'bg-gray-100 border-gray-200',
  },
}

function StatusBadgeInline({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.OFFLINE
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.color} ${s.bg}`}>
      {s.icon}
      {s.label}
    </span>
  )
}

export default function DelivererDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const { can } = useAccess()
  const isAdmin = user?.role === 'OWNER' || user?.role === 'MANAGER'

  const { data, isLoading } = useSWR<DelivererDetail>(
    `/deliverers/${id}/history`,
    (url: string) => api.get<DelivererDetail>(url)
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!data) return <div className="p-6 text-gray-500">Entregador não encontrado</div>

  const currentStyle = STATUS_STYLE[data.status] ?? STATUS_STYLE.OFFLINE

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/deliverers"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para entregadores
      </Link>

      {/* Profile card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          {data.profileImageUrl ? (
            <img
              src={data.profileImageUrl}
              alt={data.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-400">
              {data.name[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            <p className="text-sm text-gray-500">@{data.username}</p>
            {data.email && <p className="text-sm text-gray-500">{data.email}</p>}
            {isAdmin && data.ratingCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-1">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-700">
                  {data.avgRating?.toFixed(1)}
                </span>
                <span className="text-xs text-yellow-600">
                  ({data.ratingCount} {data.ratingCount === 1 ? 'avaliação' : 'avaliações'})
                </span>
              </div>
            )}
            {isAdmin && data.ratingCount === 0 && (
              <p className="mt-2 text-xs text-gray-400">Sem avaliações ainda</p>
            )}
          </div>
          <StatusBadgeInline status={data.status} />
        </div>
      </div>

      {/* Pontualidade hoje */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pontualidade hoje
        </h2>
        <PunctualityCard p={data.punctuality} />
      </div>

      {/* Horário de trabalho */}
      <div className="mt-6">
        <WorkScheduleSection delivererId={id} canEdit={can({ scope: 'deliverers:manage' })} />
      </div>

      {/* Conquistas (gamificação) */}
      {can({ scope: 'goals:view' }) && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Conquistas
          </h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <AchievementsPanel delivererId={id} />
          </div>
        </div>
      )}

      {/* Status history */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Histórico de Status
        </h2>

        {data.history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            Nenhuma mudança de status registrada ainda
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="divide-y divide-gray-100">
              {data.history.map((entry, i) => {
                const s = STATUS_STYLE[entry.status] ?? STATUS_STYLE.OFFLINE
                const mapsUrl = entry.lat != null && entry.lng != null
                  ? `https://www.google.com/maps?q=${entry.lat},${entry.lng}`
                  : null
                return (
                  <div key={i} className="flex items-start gap-4 px-5 py-4">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${s.bg} ${s.color}`}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(entry.changedAt)}
                        </span>
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            <MapPin className="h-3 w-3" />
                            {entry.lat!.toFixed(5)}, {entry.lng!.toFixed(5)}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <MapPin className="h-3 w-3" />
                            Localização não capturada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
