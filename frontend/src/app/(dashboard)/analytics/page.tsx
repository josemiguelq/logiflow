'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Package, Clock, Truck, CheckCircle, XCircle, Navigation,
  Users, TrendingUp, Calendar,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TimePoint { date: string; count: number }

interface StatusCounts {
  PREPARING: number
  ASSIGNED: number
  ON_ROUTE: number
  OUT_FOR_DELIVERY: number
  DELIVERED: number
  CANCELLED: number
}

interface DelivererSummary {
  available: number
  onRoute:   number
  offline:   number
  total:     number
}

interface OrderAverages {
  avgOrdersPerDeliverer: number
  avgOrdersPerRoute:     number
}

interface DelivererCount { name: string; delivered: number }

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date) { return d.toISOString().slice(0, 10) }

function thisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toDateStr(from), to: toDateStr(to) }
}

function lastMonthRange() {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to   = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toDateStr(from), to: toDateStr(to) }
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

const fetcher = <T,>(url: string) => api.get<T>(url)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDay(iso: string) {
  // iso = 'YYYY-MM-DD' → 'DD/MM'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function fmtMonth(iso: string) {
  // iso = 'YYYY-MM' → 'MMM/YY'
  const [y, m] = iso.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[Number(m) - 1]}/${y!.slice(2)}`
}

// ── Status card config ────────────────────────────────────────────────────────

const STATUS_CONFIG: {
  key: keyof StatusCounts
  label: string
  icon: React.ElementType
  bg: string
  text: string
  iconColor: string
}[] = [
  { key: 'PREPARING',        label: 'Preparando',    icon: Clock,       bg: 'bg-amber-50',   text: 'text-amber-700',  iconColor: 'text-amber-500'  },
  { key: 'ASSIGNED',         label: 'Atribuído',     icon: Package,     bg: 'bg-blue-50',    text: 'text-blue-700',   iconColor: 'text-blue-500'   },
  { key: 'ON_ROUTE',         label: 'Em rota',       icon: Truck,       bg: 'bg-indigo-50',  text: 'text-indigo-700', iconColor: 'text-indigo-500' },
  { key: 'OUT_FOR_DELIVERY', label: 'Saiu p/ entrega', icon: Navigation, bg: 'bg-orange-50', text: 'text-orange-700', iconColor: 'text-orange-500' },
  { key: 'DELIVERED',        label: 'Entregue',      icon: CheckCircle, bg: 'bg-green-50',   text: 'text-green-700',  iconColor: 'text-green-500'  },
  { key: 'CANCELLED',        label: 'Cancelado',     icon: XCircle,     bg: 'bg-red-50',     text: 'text-red-700',    iconColor: 'text-red-500'    },
]

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-lg text-sm">
      <p className="font-medium text-gray-700">{label}</p>
      <p className="text-gray-900 font-bold">{payload[0]?.value} pedidos</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ACCESS = { scope: 'analytics:view' } as const

export default function AnalyticsPage() {
  const { can, isLoading } = useAccess()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!can(ACCESS)) router.replace('/orders')
  }, [isLoading, can, router])

  const [scale,  setScale]  = useState<'day' | 'month'>('day')
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d')

  const [dcRange, setDcRange] = useState(thisMonthRange)
  const dcParams = new URLSearchParams({ from: dcRange.from, to: dcRange.to })

  const { data: timeseries, isLoading: tsLoading } = useSWR<TimePoint[]>(
    `/analytics/orders/timeseries?scale=${scale}`,
    fetcher,
    { keepPreviousData: true }
  )

  const { data: byStatus } = useSWR<StatusCounts>(
    '/analytics/orders/by-status',
    fetcher
  )

  const { data: deliverers } = useSWR<DelivererSummary>(
    '/analytics/deliverers/summary',
    fetcher
  )

  const { data: averages } = useSWR<OrderAverages>(
    `/analytics/orders/averages?period=${period}`,
    fetcher
  )

  const { data: delivererCounts = [], isLoading: dcLoading } = useSWR<DelivererCount[]>(
    `/analytics/deliverers/delivered-counts?${dcParams}`,
    fetcher
  )

  const chartData = (timeseries ?? []).map(p => ({
    label: scale === 'day' ? fmtDay(p.date) : fmtMonth(p.date),
    count: p.count,
  }))

  const totalOrders = byStatus
    ? Object.values(byStatus).reduce((a, b) => a + b, 0)
    : 0

  if (isLoading || !can(ACCESS)) return null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analítico</h1>
          <p className="text-sm text-gray-500">{totalOrders} pedidos no total</p>
        </div>
        <TrendingUp className="h-6 w-6 text-gray-300" />
      </div>

      {/* Time-series chart */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Pedidos por período</h2>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            <button
              onClick={() => setScale('day')}
              className={`px-3 py-1.5 transition-colors ${
                scale === 'day'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setScale('month')}
              className={`px-3 py-1.5 border-l border-gray-200 transition-colors ${
                scale === 'month'
                  ? 'bg-gray-900 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Mês
            </button>
          </div>
        </div>

        {tsLoading && !timeseries ? (
          <div className="flex h-52 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barSize={scale === 'day' ? 10 : 24}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                interval={scale === 'day' ? 4 : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
              <Bar dataKey="count" fill="var(--color-primary, #2563EB)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Status cards + Deliverers card */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {STATUS_CONFIG.map(({ key, label, icon: Icon, bg, text, iconColor }) => (
          <div
            key={key}
            className={`rounded-2xl border border-gray-100 ${bg} px-4 py-4 shadow-sm`}
          >
            <div className="mb-2 flex items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
              <span className={`text-xs font-medium ${text}`}>{label}</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">
              {byStatus ? byStatus[key] : '—'}
            </p>
          </div>
        ))}

        {/* Deliverers summary card */}
        <div className="col-span-2 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm sm:col-span-1 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Entregadores</span>
          </div>

          <div className="flex items-end gap-4">
            {/* Available — big */}
            <div>
              <p className="text-4xl font-bold text-green-600">
                {deliverers ? deliverers.available : '—'}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">disponíveis</p>
            </div>

            <div className="mb-1 flex flex-col gap-1">
              {/* On route */}
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-indigo-600">
                  {deliverers ? deliverers.onRoute : '—'}
                </span>
                <span className="text-xs text-gray-400">em rota</span>
              </div>
              {/* Offline — smaller */}
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold text-gray-400">
                  {deliverers ? deliverers.offline : '—'}
                </span>
                <span className="text-xs text-gray-400">offline</span>
              </div>
            </div>

            {/* Total pill */}
            <div className="ml-auto self-start rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              {deliverers ? `${deliverers.total} total` : '—'}
            </div>
          </div>
        </div>

        {/* Avg cards — span full width to include the period selector header */}
        <div className="col-span-2 sm:col-span-3 lg:col-span-4 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          {/* Period selector header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Médias</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {(['today', '7d', '30d'] as const).map((p, i) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                    period === p ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p === 'today' ? 'Hoje' : p === '7d' ? '7 dias' : '30 dias'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-100">
            {/* Avg per deliverer */}
            <div className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Truck className="h-4 w-4 shrink-0 text-violet-500" />
                <span className="text-xs font-medium text-violet-700">Média por entregador</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {averages ? averages.avgOrdersPerDeliverer.toFixed(1) : '—'}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">entregas concluídas</p>
            </div>

            {/* Avg per route */}
            <div className="px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <Navigation className="h-4 w-4 shrink-0 text-sky-500" />
                <span className="text-xs font-medium text-sky-700">Média por rota</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {averages ? averages.avgOrdersPerRoute.toFixed(1) : '—'}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">pedidos por rota</p>
            </div>
          </div>
        </div>
      </div>

      {/* Delivered orders per deliverer */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 mr-auto">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span className="text-sm font-semibold text-gray-800">Entregas por entregador</span>
          </div>

          {/* Quick filters */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {([
              { label: 'Este mês',    range: thisMonthRange() },
              { label: 'Mês passado', range: lastMonthRange() },
            ] as const).map(({ label, range }, i) => {
              const active = dcRange.from === range.from && dcRange.to === range.to
              return (
                <button
                  key={label}
                  onClick={() => setDcRange(range)}
                  className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                    active ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Calendar range */}
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="date"
              value={dcRange.from}
              max={dcRange.to}
              onChange={e => setDcRange(r => ({ ...r, from: e.target.value }))}
              className="w-28 bg-transparent outline-none"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              value={dcRange.to}
              min={dcRange.from}
              max={toDateStr(new Date())}
              onChange={e => setDcRange(r => ({ ...r, to: e.target.value }))}
              className="w-28 bg-transparent outline-none"
            />
          </div>
        </div>

        {/* Body */}
        {dcLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
          </div>
        ) : delivererCounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Truck className="mb-2 h-8 w-8" />
            <p className="text-sm">Nenhuma entrega no período</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {(() => {
              const max = delivererCounts[0]?.delivered ?? 1
              return delivererCounts.map((d, i) => (
                <div key={d.name} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-5 text-right text-xs font-medium text-gray-400">{i + 1}</span>
                  <span className="w-40 shrink-0 truncate text-sm font-medium text-gray-800">{d.name}</span>
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-green-500 transition-all"
                        style={{ width: `${(d.delivered / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-sm font-bold text-gray-900">{d.delivered}</span>
                  </div>
                </div>
              ))
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
