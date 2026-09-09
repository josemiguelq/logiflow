'use client'

import { Calendar, Download, Loader2, Radio } from 'lucide-react'
import type { AnalyticsFilters } from './_use-analytics-filters'
import type { Shortcut } from './_types'
import { toDateStr } from './_utils'

const SHORTCUTS: { key: Shortcut; label: string }[] = [
  { key: 'today',     label: 'Hoje' },
  { key: 'yesterday', label: 'Ontem' },
  { key: '7d',        label: '7 Dias' },
  { key: 'thisMonth', label: 'Mês Atual' },
  { key: 'custom',    label: 'Personalizado' },
]

interface Props {
  filters:       AnalyticsFilters
  canExport:     boolean
  exporting:     boolean
  onExport:      (format: 'csv' | 'xlsx' | 'pdf') => void
}

export function AnalyticsFilterBar({ filters, canExport, exporting, onExport }: Props) {
  const {
    shortcut, range, compareEnabled, compareRange, isToday,
    setShortcut, setCustomRange, setCompareEnabled, setCustomCompareRange,
  } = filters

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        {/* Atalhos de período */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {SHORTCUTS.map(({ key, label }, i) => (
            <button
              key={key}
              onClick={() => setShortcut(key)}
              className={`px-3 py-1.5 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                shortcut === key ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isToday && (
          <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700">
            <Radio className="h-3 w-3 animate-pulse" />
            AO VIVO
          </span>
        )}

        {/* Período atual (personalizado) */}
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <input
            type="date"
            value={range.from}
            max={range.to}
            onChange={e => setCustomRange({ ...range, from: e.target.value })}
            className="w-28 bg-transparent outline-none"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={range.to}
            min={range.from}
            max={toDateStr(new Date())}
            onChange={e => setCustomRange({ ...range, to: e.target.value })}
            className="w-28 bg-transparent outline-none"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {canExport && (
            <ExportMenu exporting={exporting} onExport={onExport} />
          )}
        </div>
      </div>

      {/* Comparação */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={e => setCompareEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Comparar Outro Período
        </label>

        {compareEnabled && compareRange && (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="date"
              value={compareRange.from}
              max={compareRange.to}
              onChange={e => setCustomCompareRange({ ...compareRange, from: e.target.value })}
              className="w-28 bg-transparent outline-none"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              value={compareRange.to}
              min={compareRange.from}
              onChange={e => setCustomCompareRange({ ...compareRange, to: e.target.value })}
              className="w-28 bg-transparent outline-none"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ExportMenu({ exporting, onExport }: { exporting: boolean; onExport: Props['onExport'] }) {
  return (
    <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm font-medium">
      {(['csv', 'xlsx', 'pdf'] as const).map((fmt, i) => (
        <button
          key={fmt}
          onClick={() => onExport(fmt)}
          disabled={exporting}
          className={`flex items-center gap-1.5 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors ${i > 0 ? 'border-l border-gray-200' : ''}`}
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {fmt.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
