'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { Clock, Package, XCircle, Truck } from 'lucide-react'
import { WidgetFrame } from './_widget-frame'
import { fmtDay, fmtMonth, fmtDuration } from './_utils'
import type {
  TimeseriesResponse, StatusCounts, HalfHourResponse, CancellationsResponse, CancellationReasons,
  OrderDurations, OrderAverages, DurationBucketDay,
} from './_types'

const COMPARE_COLOR = '#94A3B8' // cinza discreto — linha de período comparativo em todos os gráficos

const AXIS_TICK = { fontSize: 11, fill: '#9CA3AF' }

function ChartCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Evolução de Pedidos ──────────────────────────────────────────────────────

export function OrdersEvolutionChart({
  data, loading, error, scale, onScaleChange,
}: {
  data:     TimeseriesResponse | undefined
  loading:  boolean
  error:    unknown
  scale:    'day' | 'month'
  onScaleChange: (s: 'day' | 'month') => void
}) {
  const current = data?.current ?? []
  const compare = data?.compare ?? null
  const chartData = current.map((p, i) => ({
    label:   scale === 'day' ? fmtDay(p.date) : fmtMonth(p.date),
    current: p.count,
    compare: compare?.[i]?.count,
  }))
  const empty = chartData.every(d => (d.current ?? 0) === 0 && !d.compare)

  return (
    <ChartCard
      title="Evolução de Pedidos"
      action={
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
          {(['day', 'month'] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => onScaleChange(s)}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                scale === s ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s === 'day' ? 'Dia' : 'Mês'}
            </button>
          ))}
        </div>
      }
    >
      <WidgetFrame loading={loading} error={error} empty={empty} emptyIcon={Package} emptyMessage="Nenhum pedido no período">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={scale === 'day' ? 4 : 0} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="current" name="Período atual" stroke="var(--color-primary, #2563EB)" strokeWidth={2} dot={false} />
            {compare && <Line dataKey="compare" name="Período comparado" stroke={COMPARE_COLOR} strokeWidth={2} strokeDasharray="4 4" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </WidgetFrame>
    </ChartCard>
  )
}

// ── Distribuição por Status ──────────────────────────────────────────────────

const STATUS_CONFIG: { key: keyof StatusCounts; label: string; color: string }[] = [
  { key: 'PREPARING',        label: 'Preparando',      color: '#F59E0B' },
  { key: 'ASSIGNED',         label: 'Atribuído',       color: '#2563EB' },
  { key: 'ON_ROUTE',         label: 'Em rota',         color: '#6366F1' },
  { key: 'OUT_FOR_DELIVERY', label: 'Saiu p/ entrega', color: '#F97316' },
  { key: 'DELIVERED',        label: 'Entregue',        color: '#16A34A' },
  { key: 'CANCELLED',        label: 'Cancelado',       color: '#DC2626' },
]

export function StatusDistributionChart({ data, loading, error }: {
  data: StatusCounts | undefined; loading: boolean; error: unknown
}) {
  const chartData = STATUS_CONFIG.map(s => ({ label: s.label, count: data?.[s.key] ?? 0, color: s.color }))
  const empty = chartData.every(d => d.count === 0)

  return (
    <ChartCard title="Distribuição por Status">
      <WidgetFrame loading={loading} error={error} empty={empty} emptyIcon={Package} emptyMessage="Nenhum pedido no período" height={240}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#F9FAFB' }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
              {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </WidgetFrame>
    </ChartCard>
  )
}

// ── Volume por Faixa Horária ─────────────────────────────────────────────────

export function HourlyVolumeChart({ data, loading, error }: {
  data: HalfHourResponse | undefined; loading: boolean; error: unknown
}) {
  const current = data?.current ?? []
  const compare = data?.compare ?? null
  const chartData = current.map((p, i) => ({ slot: p.slot, current: p.count, compare: compare?.[i]?.count }))
  const empty = chartData.every(d => (d.current ?? 0) === 0 && !d.compare)

  return (
    <ChartCard title="Volume por Faixa Horária">
      <WidgetFrame loading={loading} error={error} empty={empty} emptyIcon={Clock} emptyMessage="Nenhum pedido no período" height={260}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="slot" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={3} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line dataKey="current" name="Período atual" stroke="var(--color-primary, #2563EB)" strokeWidth={2} dot={false} />
            {compare && <Line dataKey="compare" name="Período comparado" stroke={COMPARE_COLOR} strokeWidth={2} strokeDasharray="4 4" dot={false} />}
          </LineChart>
        </ResponsiveContainer>
      </WidgetFrame>
    </ChartCard>
  )
}

// ── Cancelamentos ─────────────────────────────────────────────────────────────

const REASON_LABEL: Record<string, string> = {
  MISSING_ITEM: 'Item faltando',
  WRONG_ORDER:  'Pedido errado',
  OTHER:        'Outro motivo',
  LEGACY:       'Não informado',
}

export function CancellationsChart({ data, loading, error }: {
  data: CancellationsResponse | undefined; loading: boolean; error: unknown
}) {
  const chartData = (Object.keys(REASON_LABEL) as (keyof CancellationReasons)[]).map(code => ({
    label:   REASON_LABEL[code],
    current: data?.current?.[code] ?? 0,
    compare: data?.compare?.[code],
  }))
  const empty = chartData.every(d => d.current === 0 && !d.compare)

  return (
    <ChartCard title="Cancelamentos">
      <WidgetFrame loading={loading} error={error} empty={empty} emptyIcon={XCircle} emptyMessage="Nenhum cancelamento no período">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
            <Tooltip cursor={{ fill: '#F9FAFB' }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="current" name="Período atual" fill="#DC2626" radius={[4, 4, 0, 0]} />
            {data?.compare && <Bar dataKey="compare" name="Período comparado" fill={COMPARE_COLOR} radius={[4, 4, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
      </WidgetFrame>
    </ChartCard>
  )
}

// ── Performance Operacional ──────────────────────────────────────────────────

export function OperationalPerformanceChart({
  durations, averages, buckets, loading, error,
}: {
  durations: OrderDurations   | undefined
  averages:  OrderAverages    | undefined
  buckets:   DurationBucketDay[] | undefined
  loading:   boolean
  error:     unknown
}) {
  const hasData = !!durations && durations.count > 0

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-800">Performance Operacional</h2>
      <WidgetFrame loading={loading} error={error} empty={!hasData} emptyIcon={Clock} emptyMessage="Nenhuma entrega concluída no período" height={220}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Preparação" color="text-amber-600" value={fmtDuration(durations?.avgPrepMin ?? 0)} sub="criação → coleta" />
          <Stat label="Em rota" color="text-indigo-600" value={fmtDuration(durations?.avgRouteMin ?? 0)} sub="coleta → entrega" />
          <Stat label="Total" color="text-green-600" value={fmtDuration(durations?.avgTotalMin ?? 0)} sub="criação → entrega" />
          <Stat label="Média/entregador" color="text-violet-600" value={(averages?.avgOrdersPerDeliverer ?? 0).toFixed(1)} sub="entregas concluídas" />
        </div>

        {buckets && buckets.length > 0 && (
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DurationBucketChart
              title="Tempo de preparação"
              subtitle="criação → coleta"
              data={buckets.map(b => ({ label: fmtDay(b.date), lt30: b.prepLt30, mid: b.prep30to45, gt45: b.prepGt45 }))}
            />
            <DurationBucketChart
              title="Tempo em rota"
              subtitle="coleta → entrega"
              data={buckets.map(b => ({ label: fmtDay(b.date), lt30: b.routeLt30, mid: b.route30to45, gt45: b.routeGt45 }))}
            />
          </div>
        )}
      </WidgetFrame>
    </div>
  )
}

function Stat({ label, color, value, sub }: { label: string; color: string; value: string; sub: string }) {
  return (
    <div>
      <p className={`mb-1 text-xs font-medium uppercase tracking-wide ${color}`}>{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{sub}</p>
    </div>
  )
}

interface BucketPoint { label: string; lt30: number; mid: number; gt45: number }

function DurationBucketChart({ title, subtitle, data }: { title: string; subtitle: string; data: BucketPoint[] }) {
  const empty = data.every(d => d.lt30 + d.mid + d.gt45 === 0)
  return (
    <div className="rounded-xl border border-gray-100 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
      {empty ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Truck className="mb-2 h-6 w-6" />
          <p className="text-xs">Sem dados no período</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barSize={data.length > 20 ? 8 : 16}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} interval={data.length > 20 ? 4 : 0} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
            <Tooltip cursor={{ fill: '#F9FAFB' }} />
            <Bar dataKey="lt30" stackId="a" name="< 30 min"  fill="#16A34A" />
            <Bar dataKey="mid"  stackId="a" name="30–45 min" fill="#F59E0B" />
            <Bar dataKey="gt45" stackId="a" name="> 45 min"  fill="#DC2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

