'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Package, Clock, Truck, CheckCircle, XCircle, Navigation,
  Users, TrendingUp,
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

  const [scale, setScale] = useState<'day' | 'month'>('day')

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
      </div>
    </div>
  )
}
