'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Clock, Store, TrendingUp } from 'lucide-react'

const StoresMap = dynamic(() => import('./_stores_map'), { ssr: false })

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface StoreStats {
  id:         string
  name:       string
  lat:        number | null
  lng:        number | null
  city:       string | null
  total:      number
  delivered:  number
  cancelled:  number
  inProgress: number
}

function saFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem(SA_TOKEN_KEY)
  return fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then(async r => {
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Erro') }
    return r.json()
  })
}

export default function SuperAdminAnalyticsPage() {
  const router = useRouter()
  const [stats,   setStats]   = useState<StoreStats[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await saFetch<StoreStats[]>('/super-admin/analytics')
      setStats(data)
    } catch {
      router.replace('/super-admin')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!localStorage.getItem(SA_TOKEN_KEY)) { router.replace('/super-admin'); return }
    load()
  }, [load, router])

  const totalDelivered  = stats.reduce((s, r) => s + r.delivered,  0)
  const totalCancelled  = stats.reduce((s, r) => s + r.cancelled,  0)
  const totalInProgress = stats.reduce((s, r) => s + r.inProgress, 0)
  const totalOrders     = stats.reduce((s, r) => s + r.total,      0)

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analítico</h1>
          <p className="text-sm text-gray-500">{stats.length} lojas · {totalOrders} pedidos no total</p>
        </div>
        <TrendingUp className="h-6 w-6 text-gray-300" />
      </div>

      {/* Summary cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Entregas"
          value={totalDelivered}
          icon={<CheckCircle className="h-5 w-5 text-green-500" />}
          bg="bg-green-50"
        />
        <SummaryCard
          label="Em andamento"
          value={totalInProgress}
          icon={<Clock className="h-5 w-5 text-blue-500" />}
          bg="bg-blue-50"
        />
        <SummaryCard
          label="Cancelados"
          value={totalCancelled}
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          bg="bg-red-50"
        />
        <SummaryCard
          label="Lojas ativas"
          value={stats.length}
          icon={<Store className="h-5 w-5 text-gray-500" />}
          bg="bg-gray-50"
        />
      </div>

      {/* Stores map */}
      {stats.some(s => s.lat != null && s.lng != null) && (
        <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-700">Localização das lojas</h2>
          </div>
          <div style={{ height: 360 }}>
            <StoresMap
              stores={stats
                .filter((s): s is StoreStats & { lat: number; lng: number } =>
                  s.lat != null && s.lng != null
                )
                .map(s => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, delivered: s.delivered }))}
            />
          </div>
        </div>
      )}

      {/* Per-store table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-700">Entregas por loja</h2>
        </div>

        {stats.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">Nenhum dado ainda</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.map(s => {
              const pct = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0
              return (
                <div key={s.id} className="px-5 py-4">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                        <Store className="h-3.5 w-3.5 text-gray-500" />
                      </div>
                      <p className="truncate font-medium text-gray-900">{s.name}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm">
                      <span className="flex items-center gap-1 font-semibold text-green-700">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {s.delivered}
                      </span>
                      <span className="flex items-center gap-1 text-blue-600">
                        <Clock className="h-3.5 w-3.5" />
                        {s.inProgress}
                      </span>
                      <span className="flex items-center gap-1 text-red-400">
                        <XCircle className="h-3.5 w-3.5" />
                        {s.cancelled}
                      </span>
                      <span className="w-10 text-right text-xs text-gray-400">
                        {s.total} total
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 overflow-hidden rounded-full bg-gray-100" style={{ height: 6 }}>
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs font-medium text-gray-500">{pct}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({
  label, value, icon, bg,
}: {
  label: string
  value: number
  icon:  React.ReactNode
  bg:    string
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 ${bg} px-4 py-4 shadow-sm`}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
