'use client'

import { use, useEffect, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, Truck, MapPin, Navigation } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { StatusBadge } from '@/components/ui/badge'
import { LiveMap, MapDestination } from '@/components/map'

interface LocationPoint { lat: number; lng: number; recorded_at: string }

export default function OrderTrackingPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params)
  const { user }    = useAuth()
  const { on }      = useWebSocket(user?.storeId)

  const { data: order, mutate } = useSWR<Order>(
    `/orders/${orderId}`,
    (u: string) => api.get<Order>(u),
    { refreshInterval: 20_000 }
  )

  const delivererId = order?.deliverer?.id

  const { data: location, mutate: mutateLocation } = useSWR<LocationPoint>(
    delivererId ? `/tracking/deliverer/${delivererId}/latest` : null,
    (u: string) => api.get<LocationPoint>(u),
    { refreshInterval: 10_000 }
  )

  // Atualiza posição em tempo real via WebSocket
  useEffect(() => {
    return on('deliverer_location', (data: unknown) => {
      const d = data as { delivererId: string; lat: number; lng: number }
      if (d.delivererId === delivererId) mutateLocation()
    })
  }, [on, delivererId, mutateLocation])

  useEffect(() => {
    return on('order_updated', () => mutate())
  }, [on, mutate])

  const destinations: MapDestination[] = order?.customer.lat
    ? [{ lat: order.customer.lat, lng: order.customer.lng!, label: order.customer.name }]
    : []

  const canTrack = order && !['DELIVERED', 'CANCELLED', 'PREPARING'].includes(order.status)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href="/orders"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Pedidos
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-medium text-gray-700">
          Rastrear #{orderId.slice(-8).toUpperCase()}
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Painel lateral */}
        <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-gray-200 bg-white p-5">
          {!order ? (
            <div className="animate-pulse space-y-3">
              <div className="h-5 w-2/3 rounded bg-gray-200" />
              <div className="h-4 w-full rounded bg-gray-200" />
              <div className="h-4 w-3/4 rounded bg-gray-200" />
            </div>
          ) : (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    Pedido #{order.id.slice(-8).toUpperCase()}
                  </h2>
                  <StatusBadge status={order.status} />
                </div>
              </div>

              {/* Cliente */}
              <section className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Cliente</p>
                <p className="font-medium text-gray-900">{order.customer.name}</p>
                <div className="mt-1.5 flex items-start gap-1.5 text-sm text-gray-600">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                  {order.customer.address}
                </div>
              </section>

              {/* Entregador */}
              {order.deliverer ? (
                <section className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Entregador</p>
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      {order.deliverer.name.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-900">{order.deliverer.name}</span>
                  </div>
                  {location && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
                      <Navigation className="h-3 w-3" />
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </div>
                  )}
                  <Link
                    href={`/tracking/deliverer/${order.deliverer.id}`}
                    className="mt-2 block text-xs hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    Ver todos os pedidos deste entregador
                  </Link>
                </section>
              ) : (
                <section className="rounded-xl border border-dashed border-gray-200 p-3.5 text-center text-sm text-gray-400">
                  Aguardando atribuição de entregador
                </section>
              )}

              {/* Posição atual */}
              {!canTrack && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5 text-center text-sm text-gray-400">
                  {order.status === 'PREPARING'
                    ? 'Pedido ainda não saiu para entrega'
                    : 'Entrega finalizada'}
                </div>
              )}
            </>
          )}
        </aside>

        {/* Mapa */}
        <div className="relative flex-1 bg-gray-100">
          {!canTrack && order && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <p className="text-sm font-medium text-gray-500">
                {order.status === 'PREPARING'
                  ? 'Mapa disponível após atribuição do entregador'
                  : 'Esta entrega foi finalizada'}
              </p>
            </div>
          )}
          <LiveMap
            delivererLat={location?.lat}
            delivererLng={location?.lng}
            delivererName={order?.deliverer?.name}
            destinations={destinations}
            height="100%"
          />
        </div>
      </div>
    </div>
  )
}
