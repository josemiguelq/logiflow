'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { TrendingUp } from 'lucide-react'
import { useAccess } from '@/hooks/useAccess'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'
import { useWs } from '@/hooks/WsContext'
import { AnalyticsFilterBar } from './_filter-bar'
import { useAnalyticsFilters } from './_use-analytics-filters'
import { useLastUpdated } from './_use-last-updated'
import { KpiCards } from './_kpi-cards'
import { ExecutiveSummary, buildInsights } from './_executive-summary'
import {
  OrdersEvolutionChart, StatusDistributionChart, HourlyVolumeChart,
  CancellationsChart, OperationalPerformanceChart,
} from './_charts'
import { CustomersSection } from './_customers-section'
import { DeliverersSection } from './_deliverers-section'
import { exportCsv, exportXlsx, exportPdf, type AnalyticsSnapshot } from './_export'
import { analyticsFetcher as fetcher } from './_fetcher'
import type {
  KpisResponse, TimeseriesResponse, StatusCounts, HalfHourResponse, CancellationsResponse,
  OrderAverages, OrderDurations, DurationBucketDay, DelivererPerformance,
  CustomerOrderCountsSummary, ThemeData,
} from './_types'

const ACCESS = { scope: 'analytics:view' } as const

export default function AnalyticsPage() {
  const { can, isLoading } = useAccess()
  const features = useStoreFeatures()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return
    if (!can(ACCESS)) router.replace('/orders')
  }, [isLoading, can, router])

  const filters = useAnalyticsFilters()
  const { range, compareRange, isToday } = filters
  const { lastUpdated, touch } = useLastUpdated()
  const [scale, setScale] = useState<'day' | 'month'>('day')
  const [exporting, setExporting] = useState(false)
  const [delivererVisible, setDelivererVisible] = useState<DelivererPerformance[]>([])

  const rangeParams = new URLSearchParams({ from: range.from, to: range.to })
  if (compareRange) {
    rangeParams.set('compareFrom', compareRange.from)
    rangeParams.set('compareTo', compareRange.to)
  }
  const plainParams = new URLSearchParams({ from: range.from, to: range.to })

  const swrOpts = { refreshInterval: 60_000, keepPreviousData: true, onSuccess: () => touch() }

  const { data: kpis, isLoading: kpisLoading, error: kpisError } =
    useSWR<KpisResponse>(`/analytics/kpis?${rangeParams}`, fetcher, swrOpts)

  const { data: timeseries, isLoading: tsLoading, error: tsError } =
    useSWR<TimeseriesResponse>(`/analytics/orders/timeseries?${rangeParams}&scale=${scale}`, fetcher, swrOpts)

  const { data: byStatus, isLoading: statusLoading, error: statusError } =
    useSWR<StatusCounts>(`/analytics/orders/by-status?${plainParams}`, fetcher, swrOpts)

  const { data: halfHour, isLoading: hhLoading, error: hhError } =
    useSWR<HalfHourResponse>(`/analytics/orders/created-by-halfhour?${rangeParams}`, fetcher, swrOpts)

  const { data: cancellations, isLoading: cancelLoading, error: cancelError } =
    useSWR<CancellationsResponse>(`/analytics/cancellations/by-reason?${rangeParams}`, fetcher, swrOpts)

  const { data: averages, isLoading: avgLoading, error: avgError } =
    useSWR<OrderAverages>(`/analytics/orders/averages?${plainParams}`, fetcher, swrOpts)

  const { data: durations } =
    useSWR<OrderDurations>(`/analytics/orders/durations?${plainParams}`, fetcher, swrOpts)

  const { data: buckets } =
    useSWR<DurationBucketDay[]>(`/analytics/orders/duration-buckets?${plainParams}`, fetcher, swrOpts)

  const { data: deliverers, isLoading: delLoading, error: delError } =
    useSWR<DelivererPerformance[]>(`/analytics/deliverers/performance?${plainParams}`, fetcher, swrOpts)

  const { data: customers, isLoading: custLoading, error: custError } =
    useSWR<CustomerOrderCountsSummary>(`/analytics/customers/order-counts?${rangeParams}`, fetcher, swrOpts)

  const { data: themeData } = useSWR<ThemeData>('/store/theme', fetcher)

  // ── Tempo real: um evento "analytics_updated" invalida todo o cache de
  // /analytics de uma vez (SWR revalida cada chave já montada na tela).
  const { on, onReconnect } = useWs()
  const { mutate } = useSWRConfig()
  const invalidateAll = useCallback(() => {
    mutate(key => typeof key === 'string' && key.startsWith('/analytics'), undefined, { revalidate: true })
    touch()
  }, [mutate, touch])
  useEffect(() => on('analytics_updated', invalidateAll), [on, invalidateAll])
  useEffect(() => onReconnect(invalidateAll), [onReconnect, invalidateAll])

  const insights = buildInsights({ kpis, cancellations, halfHour, customers })

  const canExport = can({ scope: 'analytics:export' }) && features.csvExportEnabled

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(true)
    try {
      const snapshot: AnalyticsSnapshot = {
        range,
        compareRange,
        kpis,
        deliverers: delivererVisible,
        customersTop: (customers?.top ?? []).slice(0, 5),
        customersBottom: customers?.bottom ?? [],
      }
      if (format === 'csv') exportCsv(snapshot)
      else if (format === 'xlsx') await exportXlsx(snapshot)
      else await exportPdf(snapshot)
    } finally {
      setExporting(false)
    }
  }

  const logoUrl = themeData?.theme?.logoUrl ?? null
  const brandName = themeData?.theme?.storeName ?? 'LogiFlow'

  if (isLoading || !can(ACCESS)) return null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="h-9 w-auto max-w-[140px] object-contain" />
          ) : null}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analítico</h1>
            <p className="flex items-center gap-1.5 text-sm text-gray-500">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Dados em Tempo Real
              {lastUpdated && (
                <span className="text-gray-400">
                  · Última atualização {lastUpdated.toLocaleTimeString('pt-BR')}
                </span>
              )}
            </p>
          </div>
        </div>
        <TrendingUp className="h-6 w-6 text-gray-300" />
      </div>

      <AnalyticsFilterBar
        filters={filters}
        canExport={canExport}
        exporting={exporting}
        onExport={handleExport}
      />

      <KpiCards data={kpis} loading={kpisLoading && !kpis} error={kpisError} />

      <ExecutiveSummary insights={insights} loading={kpisLoading && !kpis} error={kpisError} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrdersEvolutionChart
          data={timeseries}
          loading={tsLoading && !timeseries}
          error={tsError}
          scale={scale}
          onScaleChange={setScale}
        />
        <StatusDistributionChart
          data={byStatus}
          loading={statusLoading && !byStatus}
          error={statusError}
        />
        <HourlyVolumeChart
          data={halfHour}
          loading={hhLoading && !halfHour}
          error={hhError}
        />
        <CancellationsChart
          data={cancellations}
          loading={cancelLoading && !cancellations}
          error={cancelError}
        />
      </div>

      <OperationalPerformanceChart
        durations={durations}
        averages={averages}
        buckets={buckets}
        loading={avgLoading && !durations}
        error={avgError}
      />

      <CustomersSection
        data={customers}
        loading={custLoading && !customers}
        error={custError}
        range={range}
      />

      <DeliverersSection
        rows={deliverers}
        loading={delLoading && !deliverers}
        error={delError}
        onVisibleChange={setDelivererVisible}
      />

      {isToday && (
        <p className="text-center text-xs text-gray-400">
          Modo Operação Diária — os números acima se atualizam automaticamente ao longo do dia.
        </p>
      )}
    </div>
  )
}
