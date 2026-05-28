'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Phone, Truck, Clock, Package, Camera } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { formatPhone } from '@/lib/phone'
import { LiveMap } from '@/components/map'

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading } = useSWR<Order>(
    `/orders/${id}`,
    (url: string) => api.get<Order>(url)
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (!order) return <div className="p-6 text-gray-500">Pedido não encontrado</div>

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/orders"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para pedidos
      </Link>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Pedido #{order.id.slice(-8).toUpperCase()}
            </h1>
            <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className={`mt-6 grid gap-4 ${order.status !== 'PREPARING' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {order.status !== 'PREPARING' && (
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Código de Coleta
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">{order.pickupCode}</p>
            </div>
          )}
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Código de Entrega
            </p>
            <p className="font-mono text-2xl font-bold text-gray-900">{order.deliveryCode}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Cliente
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Package className="h-4 w-4 text-gray-400" />
                {order.customer.name}
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                {formatPhone(order.customer.phone)}
              </div>
              <div className="flex items-start gap-2 text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>
                  {order.customer.address}
                  {order.customer.complement && ` — ${order.customer.complement}`}
                </span>
              </div>
            </div>
          </section>

          {order.deliverer && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Entregador
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Truck className="h-4 w-4 text-gray-400" />
                {order.deliverer.name}
                {order.routePosition !== undefined && (
                  <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                    Posição #{order.routePosition}
                  </span>
                )}
              </div>
            </section>
          )}

          <section className="border-t border-gray-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Datas
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-gray-500">Criado em:</span>
                {formatDate(order.createdAt)}
              </div>
              {order.pickedUpAt && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-500">Coletado em:</span>
                  {formatDate(order.pickedUpAt)}
                </div>
              )}
              {order.deliveredAt && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-500">Entregue em:</span>
                  {formatDate(order.deliveredAt)}
                </div>
              )}
            </div>
          </section>

          {order.notes && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Observações
              </h2>
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                {order.notes}
              </p>
            </section>
          )}

          {order.deliveryNote && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Nota do entregador
              </h2>
              <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                {order.deliveryNote}
              </p>
            </section>
          )}

          {order.proof?.photoUrl && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Comprovante de Entrega
              </h2>
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <img
                  src={order.proof.photoUrl}
                  alt="Comprovante de entrega"
                  className="w-full object-contain"
                  style={{ maxHeight: 480 }}
                />
              </div>
              {(order.proof.lat != null && order.proof.lng != null) && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-gray-500">
                    <Camera className="h-3.5 w-3.5" />
                    Local onde a foto foi tirada
                  </div>
                  <div className="h-56 overflow-hidden rounded-xl border border-gray-100">
                    <LiveMap
                      height="100%"
                      autoFitBounds
                      destinations={
                        order.customer.lat != null && order.customer.lng != null
                          ? [{ lat: order.customer.lat, lng: order.customer.lng, label: order.customer.name, markerColor: 'red' }]
                          : []
                      }
                      proofMarkers={[{ lat: order.proof.lat, lng: order.proof.lng, label: order.customer.name }]}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-400">
                    {order.proof.lat.toFixed(5)}, {order.proof.lng.toFixed(5)}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
