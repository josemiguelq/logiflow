'use client'

import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Truck, CheckCircle, XCircle, Clock } from 'lucide-react'

const TrackingMap = dynamic(() => import('./_map'), { ssr: false })

interface PublicOrder {
  id: string
  status: string
  customer: { name: string; address: string }
  deliverer?: { name: string }
  routePosition?: number
  isCurrentStop: boolean
  delivererLat?: number | null
  delivererLng?: number | null
}

const STATUS_INFO: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  PREPARING:        { label: 'Preparando seu pedido',      icon: Clock,        color: 'text-yellow-600' },
  ASSIGNED:         { label: 'Entregador a caminho',        icon: Truck,        color: 'text-blue-600' },
  ON_ROUTE:         { label: 'Pedido em rota',              icon: Truck,        color: 'text-indigo-600' },
  OUT_FOR_DELIVERY: { label: 'Saiu para entrega!',          icon: Truck,        color: 'text-orange-600' },
  DELIVERED:        { label: 'Pedido entregue!',            icon: CheckCircle,  color: 'text-green-600' },
  CANCELLED:        { label: 'Pedido cancelado',            icon: XCircle,      color: 'text-red-500' },
}

export default function PublicTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [order, setOrder]     = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

    async function load() {
      try {
        const res = await fetch(`${BASE}/tracking/${token}`)
        if (res.ok) setOrder(await res.json())
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-gray-500">
        <p className="text-lg font-medium">Pedido não encontrado</p>
      </div>
    )
  }

  const info = STATUS_INFO[order.status] ?? STATUS_INFO.PREPARING
  const Icon = info.icon
  const showMap = order.delivererLat != null && order.delivererLng != null &&
    ['ON_ROUTE', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(order.status)

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex h-14 items-center gap-2 bg-white px-4 shadow-sm">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
          <Truck className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-bold text-gray-900">LogiFlow</span>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Icon className={`h-8 w-8 ${info.color}`} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{info.label}</h1>
          </div>

          {/* Live map */}
          {showMap && (
            <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm" style={{ height: 220 }}>
              <TrackingMap
                delivererLat={order.delivererLat!}
                delivererLng={order.delivererLng!}
                delivererName={order.deliverer?.name ?? 'Entregador'}
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Cliente</p>
              <p className="mt-1 font-medium text-gray-900">{order.customer.name}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Endereço</p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-gray-900">{order.customer.address}</p>
              </div>
            </div>

            {order.deliverer && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Entregador</p>
                <div className="mt-1 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-900">{order.deliverer.name}</p>
                </div>
                {order.routePosition && order.routePosition > 1 && (
                  <p className="mt-1 text-sm text-gray-500">
                    Você é a parada #{order.routePosition} da rota
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-400">
            Atualiza automaticamente a cada 15 segundos
          </p>
        </div>
      </main>
    </div>
  )
}
