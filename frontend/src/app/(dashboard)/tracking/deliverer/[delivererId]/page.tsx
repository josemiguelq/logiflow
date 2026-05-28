'use client'

import { use, useEffect, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Package, Navigation, Truck, Route, Table2, X, CheckCircle2, Clock } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { StatusBadge } from '@/components/ui/badge'
import { LiveMap, MapDestination, ProofMarker } from '@/components/map'
import { STATUS_LABELS, formatDate } from '@/lib/utils'

interface LocationPoint { lat: number; lng: number; recorded_at: string }
interface DelivererInfo  { id: string; name: string; status: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function yesterdayStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function DelivererTrackingPage({ params }: { params: Promise<{ delivererId: string }> }) {
  const { delivererId } = use(params)
  const { user }        = useAuth()
  const { on, onReconnect } = useWebSocket(user?.storeId)

  const [from, setFrom]           = useState(todayStr)
  const [to,   setTo]             = useState(todayStr)
  const [showHistory, setShowHistory] = useState(false)

  const { data: location, mutate: mutateLocation } = useSWR<LocationPoint>(
    `/tracking/deliverer/${delivererId}/latest`,
    (u: string) => api.get<LocationPoint>(u),
    { refreshInterval: 10_000 }
  )

  const { data: history = [] } = useSWR<LocationPoint[]>(
    `/tracking/deliverer/${delivererId}/history?from=${from}&to=${to}`,
    (u: string) => api.get<LocationPoint[]>(u),
    { refreshInterval: 30_000 }
  )

  const { data: orders = [], mutate: mutateOrders } = useSWR<Order[]>(
    `/orders?delivererId=${delivererId}`,
    (u: string) => api.get<Order[]>(u),
    { refreshInterval: 15_000 }
  )

  const { data: deliverers = [] } = useSWR<DelivererInfo[]>(
    '/deliverers',
    (u: string) => api.get<DelivererInfo[]>(u)
  )

  const deliverer = deliverers.find((d) => d.id === delivererId)

  useEffect(() => {
    return on('deliverer_location', (data: unknown) => {
      const d = data as { delivererId: string }
      if (d.delivererId === delivererId) mutateLocation()
    })
  }, [on, delivererId, mutateLocation])

  useEffect(() => {
    return on('order_updated', () => mutateOrders())
  }, [on, mutateOrders])

  useEffect(() => onReconnect(() => { mutateLocation(); mutateOrders() }), [onReconnect, mutateLocation, mutateOrders])

  const activeOrders    = orders.filter((o) => !['DELIVERED', 'CANCELLED'].includes(o.status))
  const deliveredOrders = orders.filter((o) => o.status === 'DELIVERED')
    .sort((a, b) => (b.deliveredAt ?? b.createdAt) > (a.deliveredAt ?? a.createdAt) ? 1 : -1)

  const destinations: MapDestination[] = activeOrders
    .filter((o) => o.customer.lat != null)
    .map((o, i) => ({
      lat:    o.customer.lat!,
      lng:    o.customer.lng!,
      label:  `${i + 1}. ${o.customer.name}`,
      status: STATUS_LABELS[o.status],
    }))

  const proofMarkers: ProofMarker[] = orders.flatMap((o) =>
    (o.proofs ?? [])
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => ({ lat: p.lat!, lng: p.lng!, label: o.customer.name }))
  )

  const STATUS_DOT: Record<string, string> = {
    AVAILABLE: 'bg-green-500',
    ON_ROUTE:  'bg-orange-500',
    OFFLINE:   'bg-gray-300',
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href="/deliverers"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Entregadores
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">
          {deliverer?.name ?? 'Rastrear Entregador'}
        </span>
        {deliverer && (
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[deliverer.status] ?? 'bg-gray-300'}`} />
            {deliverer.status === 'AVAILABLE' ? 'Disponível'
              : deliverer.status === 'ON_ROUTE' ? 'Em rota'
              : 'Offline'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Painel lateral */}
        <aside className="flex w-full shrink-0 flex-col overflow-y-auto border-b border-gray-200 bg-white md:w-80 md:border-b-0 md:border-r">

          {/* Filtro de histórico */}
          <div className="border-b border-gray-100 p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Histórico de rota
            </p>
            <div className="mb-2 flex gap-1.5">
              <button
                onClick={() => { setFrom(todayStr()); setTo(todayStr()) }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${from === todayStr() && to === todayStr() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Hoje
              </button>
              <button
                onClick={() => { setFrom(yesterdayStr()); setTo(yesterdayStr()) }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${from === yesterdayStr() && to === yesterdayStr() ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Ontem
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-xs text-gray-400">–</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              {history.length > 0 ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Route className="h-3.5 w-3.5" />
                  {history.length} pontos registrados
                </div>
              ) : (
                <span />
              )}
              {history.length > 0 && (
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                >
                  <Table2 className="h-3.5 w-3.5" />
                  Ver detalhes
                </button>
              )}
            </div>
          </div>

          {/* Posição atual */}
          <div className="border-b border-gray-100 p-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Posição atual
            </p>
            {location ? (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <Navigation className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--color-primary)' }} />
                <div>
                  <p className="font-mono text-xs text-gray-600">
                    {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Atualizado {new Date(location.recorded_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sem localização recente</p>
            )}
          </div>

          {/* Lista de pedidos ativos */}
          <div className="flex-1 p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
              Pedidos em rota ({activeOrders.length})
            </p>

            {activeOrders.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 py-8 text-gray-400">
                <Package className="mb-2 h-8 w-8" />
                <p className="text-sm">Nenhum pedido ativo</p>
              </div>
            ) : (
              <ol className="space-y-2.5">
                {activeOrders
                  .sort((a, b) => (a.routePosition ?? 99) - (b.routePosition ?? 99))
                  .map((order, idx) => (
                    <li key={order.id}>
                      <Link
                        href={`/tracking/order/${order.id}`}
                        className="block rounded-xl border border-gray-100 bg-gray-50 p-3 transition-colors hover:border-gray-200 hover:bg-white"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            style={{ background: 'var(--color-primary)' }}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {order.customer.name}
                              </p>
                              <StatusBadge status={order.status} />
                            </div>
                            <div className="mt-0.5 flex items-start gap-1 text-xs text-gray-500">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="line-clamp-1">{order.customer.address}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ol>
            )}
          </div>
        </aside>

        {/* Mapa */}
        <div className="relative isolate min-h-[300px] flex-1 bg-gray-100">
          {!location && (
            <div className="absolute inset-x-0 top-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-700 shadow-sm">
              <Truck className="h-3.5 w-3.5" />
              Aguardando localização do entregador...
            </div>
          )}
          <LiveMap
            delivererLat={location?.lat}
            delivererLng={location?.lng}
            delivererName={deliverer?.name}
            destinations={destinations}
            trail={history}
            height="100%"
          />
        </div>
      </div>

      {/* Modal de histórico */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Histórico de localização</h2>
                <p className="text-xs text-gray-400 mt-0.5">{history.length} pontos · {from} → {to}</p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tabela */}
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">#</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Latitude</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Longitude</th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-400">Horário</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-6 py-2.5 text-xs text-gray-400">{i + 1}</td>
                      <td className="px-6 py-2.5 font-mono text-xs text-gray-700">{p.lat.toFixed(6)}</td>
                      <td className="px-6 py-2.5 font-mono text-xs text-gray-700">{p.lng.toFixed(6)}</td>
                      <td className="px-6 py-2.5 text-xs text-gray-600">
                        {new Date(p.recorded_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit', second: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
