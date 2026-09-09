'use client'

import { Package, CheckCircle, Truck, XCircle, Users, UserCheck } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import type { KpisResponse, KpiTotals, SparklinePoint } from './_types'
import { pct } from './_utils'

type KpiKey = keyof KpiTotals

const KPI_CONFIG: {
  key:       KpiKey
  label:     string
  icon:      React.ElementType
  bg:        string
  text:      string
  iconColor: string
  polarity:  'higher' | 'lower'
}[] = [
  { key: 'orders',           label: 'Pedidos',             icon: Package,     bg: 'bg-blue-50',   text: 'text-blue-700',   iconColor: 'text-blue-500',   polarity: 'higher' },
  { key: 'delivered',        label: 'Entregues',           icon: CheckCircle, bg: 'bg-green-50',  text: 'text-green-700',  iconColor: 'text-green-500',  polarity: 'higher' },
  { key: 'onRoute',          label: 'Em Rota',             icon: Truck,       bg: 'bg-indigo-50', text: 'text-indigo-700', iconColor: 'text-indigo-500', polarity: 'higher' },
  { key: 'cancelled',        label: 'Cancelados',          icon: XCircle,     bg: 'bg-red-50',    text: 'text-red-700',    iconColor: 'text-red-500',    polarity: 'lower'  },
  { key: 'activeCustomers',  label: 'Clientes Ativos',     icon: Users,       bg: 'bg-violet-50', text: 'text-violet-700', iconColor: 'text-violet-500', polarity: 'higher' },
  { key: 'activeDeliverers', label: 'Entregadores Ativos', icon: UserCheck,   bg: 'bg-amber-50',  text: 'text-amber-700',  iconColor: 'text-amber-500',  polarity: 'higher' },
]

function KpiCard({
  label, icon: Icon, bg, text, iconColor, current, compare, sparkline, polarity, loading,
}: {
  label:      string
  icon:       React.ElementType
  bg:         string
  text:       string
  iconColor:  string
  current:    number | undefined
  compare:    number | null | undefined
  sparkline:  SparklinePoint[] | undefined
  polarity:   'higher' | 'lower'
  loading:    boolean
}) {
  if (loading) {
    return (
      <div className={`rounded-2xl border border-gray-100 ${bg} px-4 py-4 shadow-sm`}>
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="h-8 w-16" />
      </div>
    )
  }

  const hasCompare = compare != null
  const diffAbs = hasCompare ? (current ?? 0) - compare! : null
  const diffPct = hasCompare ? pct(current ?? 0, compare!) : null
  const improved = diffAbs != null
    ? (polarity === 'higher' ? diffAbs >= 0 : diffAbs <= 0)
    : null

  return (
    <div className={`rounded-2xl border border-gray-100 ${bg} px-4 py-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} />
        <span className={`text-xs font-medium ${text}`}>{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{current ?? 0}</p>

      {diffAbs != null && (
        <p className={`mt-1 text-xs font-medium ${improved ? 'text-green-600' : 'text-red-600'}`}>
          {diffAbs >= 0 ? '▲' : '▼'} {Math.abs(diffAbs)}
          {diffPct != null ? ` (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(1)}%)` : ''}
        </p>
      )}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line dataKey="count" stroke="var(--color-primary, #2563EB)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function KpiCards({ data, loading, error }: {
  data: KpisResponse | undefined; loading: boolean; error?: unknown
}) {
  if (!loading && error) {
    const detail = error instanceof Error ? error.message : null
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        Não foi possível carregar os KPIs agora.
        {detail && <span className="block text-xs text-red-400">{detail}</span>}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {KPI_CONFIG.map(cfg => (
        <KpiCard
          key={cfg.key}
          label={cfg.label}
          icon={cfg.icon}
          bg={cfg.bg}
          text={cfg.text}
          iconColor={cfg.iconColor}
          polarity={cfg.polarity}
          current={data?.current[cfg.key]}
          compare={data?.compare ? data.compare[cfg.key] : null}
          sparkline={data?.sparkline?.[cfg.key]}
          loading={loading}
        />
      ))}
    </div>
  )
}
