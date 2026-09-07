'use client'

import { WidgetFrame } from './_widget-frame'
import { pct } from './_utils'
import type { KpisResponse, CancellationsResponse, HalfHourResponse, CustomerOrderCountsSummary } from './_types'

export interface Insight {
  icon: 'up' | 'down' | 'clock' | 'star'
  tone: 'positive' | 'negative' | 'neutral'
  text: string
}

const ICONS: Record<Insight['icon'], string> = { up: '▲', down: '▼', clock: '⏰', star: '★' }
const TONE_CLASS: Record<Insight['tone'], string> = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral:  'text-amber-500',
}

// Insights derivados exclusivamente de dados reais (pedidos, cancelamentos,
// horário de pico, cliente destaque). Evita redundância: não existe um
// insight separado de "entregas cresceram", já que isso é consequência
// direta do crescimento de pedidos (coberto pelo primeiro insight).
export function buildInsights({
  kpis, cancellations, halfHour, customers,
}: {
  kpis?:          KpisResponse
  cancellations?: CancellationsResponse
  halfHour?:      HalfHourResponse
  customers?:     CustomerOrderCountsSummary
}): Insight[] {
  const insights: Insight[] = []

  if (kpis?.compare) {
    const diff = kpis.current.orders - kpis.compare.orders
    const p = pct(kpis.current.orders, kpis.compare.orders)
    if (diff !== 0) {
      insights.push({
        icon: diff > 0 ? 'up' : 'down',
        tone: diff > 0 ? 'positive' : 'negative',
        text: `${diff > 0 ? '+' : ''}${diff} pedidos${p != null ? ` (${p >= 0 ? '+' : ''}${p.toFixed(1)}%)` : ''} em relação ao período comparado`,
      })
    }
  }

  if (cancellations?.compare) {
    const curTotal = Object.values(cancellations.current).reduce((a, b) => a + b, 0)
    const cmpTotal = Object.values(cancellations.compare).reduce((a, b) => a + b, 0)
    const diff = curTotal - cmpTotal
    if (diff !== 0) {
      insights.push({
        icon: diff < 0 ? 'down' : 'up',
        tone: diff < 0 ? 'positive' : 'negative',
        text: `${diff > 0 ? '+' : ''}${diff} cancelamentos em comparação ao período anterior`,
      })
    }
  }

  if (halfHour?.current?.length === 48) {
    // Agrupa os 48 slots de 30 min em 24 horas para identificar o pico.
    const hourly = Array.from({ length: 24 }, (_, h) =>
      (halfHour.current[h * 2]?.count ?? 0) + (halfHour.current[h * 2 + 1]?.count ?? 0)
    )
    const peakHour = hourly.indexOf(Math.max(...hourly))
    if (hourly[peakHour]! > 0) {
      insights.push({
        icon: 'clock',
        tone: 'neutral',
        text: `Pico operacional entre ${String(peakHour).padStart(2, '0')}h e ${String(peakHour + 1).padStart(2, '0')}h`,
      })
    }
  }

  if (customers?.top?.length && kpis?.current.orders) {
    const top = customers.top[0]!
    const share = (top.count / kpis.current.orders) * 100
    if (share >= 8) {
      insights.push({
        icon: 'star',
        tone: 'neutral',
        text: `${top.name} representou ${share.toFixed(0)}% dos pedidos`,
      })
    }
  }

  return insights
}

export function ExecutiveSummary({ insights, loading, error }: {
  insights: Insight[]; loading: boolean; error?: unknown
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-base font-semibold text-gray-800">Resumo Executivo</h2>
      <WidgetFrame
        loading={loading}
        error={error}
        empty={!loading && insights.length === 0}
        emptyMessage="Sem insights suficientes para o período selecionado"
        height={72}
      >
        <ul className="space-y-2">
          {insights.map((ins, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={TONE_CLASS[ins.tone]}>{ICONS[ins.icon]}</span>
              <span className="text-gray-700">{ins.text}</span>
            </li>
          ))}
        </ul>
      </WidgetFrame>
    </div>
  )
}
