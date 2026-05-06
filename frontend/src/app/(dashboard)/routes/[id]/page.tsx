'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Clock, MapPin, Package } from 'lucide-react'
import { DeliveryRoute, RouteStatus } from '@/types'
import { api } from '@/lib/api'

const STATUS_LABEL: Record<RouteStatus, string> = {
  CREATED:  'Criada',
  STARTED:  'Em andamento',
  FINISHED: 'Finalizada',
}

const STATUS_COLOR: Record<RouteStatus, string> = {
  CREATED:  'bg-blue-100 text-blue-700',
  STARTED:  'bg-orange-100 text-orange-700',
  FINISHED: 'bg-green-100 text-green-700',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  ASSIGNED:         'Atribuído',
  ON_ROUTE:         'Em rota',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
}

const ORDER_STATUS_COLOR: Record<string, string> = {
  ASSIGNED:         'bg-yellow-50 text-yellow-700',
  ON_ROUTE:         'bg-blue-50 text-blue-700',
  OUT_FOR_DELIVERY: 'bg-orange-50 text-orange-700',
  DELIVERED:        'bg-green-50 text-green-700',
  CANCELLED:        'bg-red-50 text-red-700',
}

interface Props { params: Promise<{ id: string }> }

export default function RouteDetailPage({ params }: Props) {
  const { id } = use(params)
  const { data: route, isLoading } = useSWR<DeliveryRoute>(
    `/routes/${id}`,
    (url: string) => api.get<DeliveryRoute>(url)
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
          style={{ borderTopColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  if (!route) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Rota não encontrada.</p>
      </div>
    )
  }

  const deliveredCount = route.orders.filter(o => o.status === 'DELIVERED').length

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/routes"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Rotas
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Rota</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Criada em {new Date(route.createdAt).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[route.status]}`}>
          {STATUS_LABEL[route.status]}
        </span>
      </div>

      {/* Info cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Código de retirada</p>
          <p className="font-mono text-lg font-bold tracking-widest text-gray-900">{route.pickupCode}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Entregador</p>
          <p className="font-medium text-gray-900">{route.deliverer.name}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Pedidos</p>
          <p className="font-medium text-gray-900">{route.orders.length} no total</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500 mb-1">Entregas</p>
          <p className="font-medium text-gray-900">{deliveredCount} / {route.orders.length}</p>
        </div>
      </div>

      {/* Orders list */}
      <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Pedidos desta rota
      </h2>

      {route.orders.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Nenhum pedido vinculado.</p>
      ) : (
        <div className="space-y-3">
          {route.orders.map((order, i) => (
            <div
              key={order.id}
              className="flex items-start gap-4 rounded-xl border border-gray-200 bg-white p-4"
            >
              {/* Position */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: 'var(--color-primary)' }}
              >
                {order.routePosition ?? i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-semibold text-gray-900 text-sm">{order.customerName}</p>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_COLOR[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {ORDER_STATUS_LABEL[order.status] ?? order.status}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{order.customerAddress}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    Cód. entrega:
                    <span className="font-mono font-bold tracking-widest text-gray-700 ml-0.5">
                      {order.deliveryCode}
                    </span>
                  </span>
                </div>
              </div>

              {/* Status icon */}
              <div className="shrink-0">
                {order.status === 'DELIVERED' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-gray-300" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
