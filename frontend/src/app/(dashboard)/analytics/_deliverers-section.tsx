'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Search, Truck } from 'lucide-react'
import { TableSkeleton } from '@/components/ui/table-skeleton'
import { Modal } from './_modal'
import { fmtDuration, sortDeliverers, successRate } from './_utils'
import type { DelivererPerformance, DelivererSortKey } from './_types'

// Referência estável: `rows ?? []` criaria um array novo a cada render
// enquanto `rows` for undefined, invalidando os useMemo abaixo a cada
// passada e disparando o useEffect (→ onVisibleChange → setState no pai)
// em loop infinito ("Maximum update depth exceeded").
const EMPTY_ROWS: DelivererPerformance[] = []

const COLUMNS: { key: DelivererSortKey; label: string }[] = [
  { key: 'delivered',   label: 'Entregas' },
  { key: 'avgRouteMin', label: 'Tempo Médio' },
  { key: 'cancelled',   label: 'Cancelamentos' },
  { key: 'successRate', label: 'Taxa de Sucesso' },
]

function Row({ row }: { row: DelivererPerformance }) {
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
      <td className="px-4 py-3 text-right text-gray-700">{row.delivered}</td>
      <td className="px-4 py-3 text-right text-gray-700">{fmtDuration(row.avgRouteMin)}</td>
      <td className="px-4 py-3 text-right text-gray-700">{row.cancelled}</td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">{successRate(row).toFixed(0)}%</td>
    </tr>
  )
}

export function DeliverersSection({
  rows, loading, error, onVisibleChange,
}: {
  rows:    DelivererPerformance[] | undefined
  loading: boolean
  error:   unknown
  onVisibleChange?: (rows: DelivererPerformance[]) => void
}) {
  const [search, setSearch]   = useState('')
  const [sortKey, setSortKey] = useState<DelivererSortKey>('delivered')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showAll, setShowAll] = useState(false)

  const all = rows ?? EMPTY_ROWS
  const filtered = useMemo(
    () => all.filter(r => r.name.toLowerCase().includes(search.toLowerCase())),
    [all, search]
  )
  const sorted = useMemo(() => sortDeliverers(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])
  const visible = sorted.slice(0, 10)

  useEffect(() => { onVisibleChange?.(sorted) }, [sorted, onVisibleChange])

  function toggleSort(key: DelivererSortKey) {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2 mr-auto">
          <Truck className="h-4 w-4 text-green-500" />
          <span className="text-sm font-semibold text-gray-800">Entregadores</span>
          <span className="text-xs text-gray-400">
            Mostrando {visible.length} de {sorted.length} entregadores
          </span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
          <Search className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-32 bg-transparent outline-none"
          />
        </div>

        {sorted.length > 10 && (
          <button onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-600 hover:underline">
            Ver Ranking Completo
          </button>
        )}
      </div>

      {loading ? (
        <table className="w-full text-sm"><tbody>
          <TableSkeleton columns={[{}, { cell: 'text-right' }, { cell: 'text-right' }, { cell: 'text-right' }, { cell: 'text-right' }]} rows={6} />
        </tbody></table>
      ) : error ? (
        <div className="m-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          Não foi possível carregar os entregadores agora.
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <Truck className="mb-2 h-8 w-8" />
          <p className="text-sm">Nenhum entregador com entregas no período</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
              <th className="px-4 py-2">Nome</th>
              {COLUMNS.map(c => (
                <th key={c.key} className="px-4 py-2 text-right">
                  <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-gray-600">
                    {c.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => <Row key={r.id} row={r} />)}
          </tbody>
        </table>
      )}

      {showAll && (
        <Modal title="Ranking Completo de Entregadores" onClose={() => setShowAll(false)}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="py-2">Nome</th>
                <th className="py-2 text-right">Entregas</th>
                <th className="py-2 text-right">Tempo Médio</th>
                <th className="py-2 text-right">Cancelamentos</th>
                <th className="py-2 text-right">Taxa de Sucesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(r => <Row key={r.id} row={r} />)}
            </tbody>
          </table>
        </Modal>
      )}
    </div>
  )
}
