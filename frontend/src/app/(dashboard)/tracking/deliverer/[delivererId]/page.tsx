'use client'

import { use, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Package, Navigation, Truck } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { StatusBadge } from '@/components/ui/badge'
import { LiveMap, MapDestination } from '@/components/map'
import { STATUS_LABELS } from '@/lib/utils'

interface LocationPoint { lat: number; lng: number; recorded_at: string }
interface DelivererInfo  { id: string; name: string; status: string }

export default function DelivererTrackingPage({ params }: { params: Promise<{ delivererId: string }> }) {
  const { delivererId } = use(params)
  const { user }        = useAuth()
  const { on }          = useWebSocket(user?.storeId)

  const { data: location, mutate: mutateLocation } = useSWR<LocationPoint>(
    `/tracking/deliverer/${delivererId}/latest`,
    (u: string) => api.get<LocationPoint>(u),
    { refreshInterval: 10_000 }
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

  // Live updates via WebSocket
  useEffect(() => {
    return on('deliverer_location', (data: unknown) => {
      const d = data as { delivererId: string }
      if (d.delivererId === delivererId) mutateLocation()
    })
  }, [on, delivererId, mutateLocation])

  useEffect(() => {
    return on('order_updated', () => mutateOrders())
  }, [on, mutateOrders])

  const activeOrders = orders.filter(
    (o) => !['DELIVERED', 'CANCELLED'].includes(o.status)
  )

  // Destinos: endereços dos clientes dos pedidos ativos
  const destinations: MapDestination[] = activeOrders
    .filter((o) => o.customer.lat != null)
    .map((o, i) => ({
      lat:    o.customer.lat!,
      lng:    o.customer.lng!,
      label:  `${i + 1}. ${o.customer.name}`,
      status: STATUS_LABELS[o.status],
    }))

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

      <div className="flex flex-1 overflow-hidden">
        {/* Painel lateral */}
        <aside className="flex w-80 shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">

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
                    Atualizado {new Date(location.recorded_at).toLocaleTimeString('pt-BR')}
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
        <div className="relative flex-1 bg-gray-100">
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
            height="100%"
          />
        </div>
      </div>
    </div>
  )
}
