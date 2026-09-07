'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Crown, UserMinus, Users } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts'
import { analyticsFetcher as fetcher } from './_fetcher'
import { WidgetFrame } from './_widget-frame'
import { Modal } from './_modal'
import { pct } from './_utils'
import type { CustomerCount, CustomerOrderCountsSummary, CustomerOrderCountsAll, DateRange } from './_types'

function CustomersBarChart({
  title, icon: Icon, iconColor, color, data, loading, error,
}: {
  title:     string
  icon:      React.ElementType
  iconColor: string
  color:     string
  data:      CustomerCount[]
  loading:   boolean
  error:     unknown
}) {
  const chartData = data.map(d => ({ name: d.name, count: d.count }))
  const empty = !data.length

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      </div>
      <WidgetFrame loading={loading} error={error} empty={empty} emptyIcon={Users} emptyMessage="Nenhum pedido no período" height={Math.max(220, data.length * 34)}>
        <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: '#F9FAFB' }} formatter={(v) => [`${v} pedidos`, 'Total']} />
            <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </WidgetFrame>
    </div>
  )
}

function growthLabel(c: CustomerCount): string | null {
  if (c.previousCount == null) return null
  const diff = c.count - c.previousCount
  const p = pct(c.count, c.previousCount)
  if (diff === 0 && p == null) return null
  return `${diff >= 0 ? '+' : ''}${diff}${p != null ? ` (${p >= 0 ? '+' : ''}${p.toFixed(0)}%)` : ''}`
}

export function CustomersSection({
  data, loading, error, range,
}: {
  data:    CustomerOrderCountsSummary | undefined
  loading: boolean
  error:   unknown
  range:   DateRange
}) {
  const [showAll, setShowAll] = useState(false)
  const top5 = (data?.top ?? []).slice(0, 5)
  const bottom = data?.bottom ?? []

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-gray-800">Clientes</span>
        </div>
        <button
          onClick={() => setShowAll(true)}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Ver Todos os Clientes
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <div>
          <CustomersBarChart
            title="Top 5 — mais pedidos"
            icon={Crown}
            iconColor="text-amber-500"
            color="#7C3AED"
            data={top5}
            loading={loading}
            error={error}
          />
          {!loading && top5.some(c => growthLabel(c)) && (
            <ul className="mt-2 space-y-1 px-1 text-xs text-gray-500">
              {top5.map(c => {
                const g = growthLabel(c)
                return g ? <li key={c.id}>{c.name}: {g}</li> : null
              })}
            </ul>
          )}
        </div>
        <CustomersBarChart
          title="Clientes de Menor Volume"
          icon={UserMinus}
          iconColor="text-gray-400"
          color="#94A3B8"
          data={bottom}
          loading={loading}
          error={error}
        />
      </div>

      {showAll && <AllCustomersModal range={range} onClose={() => setShowAll(false)} />}
    </div>
  )
}

function AllCustomersModal({ range, onClose }: { range: DateRange; onClose: () => void }) {
  const params = new URLSearchParams({ from: range.from, to: range.to, mode: 'all' })
  const { data, isLoading } = useSWR<CustomerOrderCountsAll>(
    `/analytics/customers/order-counts?${params}`, fetcher
  )
  const [search, setSearch] = useState('')
  const all = data?.all ?? []
  const filtered = all.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <Modal title="Todos os Clientes" onClose={onClose}>
      <input
        type="text"
        placeholder="Buscar cliente…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
      />
      {isLoading ? (
        <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Nenhum cliente encontrado</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="py-2">Cliente</th>
              <th className="py-2 text-right">Pedidos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(c => (
              <tr key={c.id}>
                <td className="py-2 text-gray-800">{c.name}</td>
                <td className="py-2 text-right font-medium text-gray-900">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  )
}
