'use client'

import { use, useState } from 'react'
import dynamic from 'next/dynamic'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Flag, MapPin, Package, Pencil } from 'lucide-react'
import { DeliveryRoute, RouteStatus } from '@/types'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { RouteEditor } from './_edit'
import { AdjustAddressModal } from '@/components/orders/adjust-address-modal'

const RouteMap = dynamic(() => import('./_map'), { ssr: false })

const COMPLETED_ORDER_STATUSES = ['DELIVERED', 'CANCELLED']

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

const fmtDateTime = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
      })
    : null

// Duração curta a partir de segundos: "Xs" / "Xmin" / "XminYs".
const fmtGap = (secs: number): string => {
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  if (m < 60) return s ? `${m}min ${s}s` : `${m}min`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h${mm.toString().padStart(2, '0')}min`
}

interface MapPin {
  id: string
  customerName: string
  status: string
  routePosition?: number
  lat: number
  lng: number
}

interface MapData {
  orders: MapPin[]
  trail:  { lat: number; lng: number; recorded_at: string }[]
}

interface Props { params: Promise<{ id: string }> }

export default function RouteDetailPage({ params }: Props) {
  const { id } = use(params)
  const { can } = useAccess()
  const { data: route, isLoading, mutate } = useSWR<DeliveryRoute>(
    `/routes/${id}`,
    (url: string) => api.get<DeliveryRoute>(url)
  )
  const { data: mapData, mutate: mutateMap } = useSWR<MapData>(
    `/routes/${id}/map-data`,
    (url: string) => api.get<MapData>(url)
  )
  const [finishing, setFinishing] = useState(false)
  const [editing, setEditing]     = useState(false)
  const [adjustingOrder, setAdjustingOrder] = useState<{ id: string; address: string } | null>(null)

  async function forceFinish() {
    if (!confirm('Marcar rota como finalizada?')) return
    setFinishing(true)
    try {
      await api.patch(`/routes/${id}/status`, { status: 'FINISHED' })
      await mutate()
    } finally {
      setFinishing(false)
    }
  }

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

  // Timeline: início da rota → entrega de cada pedido (com delta desde o marco
  // anterior) → finalização (com total). Ordena pelas datas reais de entrega.
  const minutesBetween = (from?: string, to?: string) =>
    from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000)) : null

  const routeStartAt = route.startedAt ?? route.createdAt
  const deliveredOrders = route.orders
    .filter(o => o.status === 'DELIVERED' && o.deliveredAt)
    .sort((a, b) => new Date(a.deliveredAt!).getTime() - new Date(b.deliveredAt!).getTime())

  const secondsBetween = (from?: string, to?: string) =>
    from && to ? Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)) : null

  const timeline = deliveredOrders.map((o, i) => ({
    id:        o.id,
    label:     o.customerName,
    at:        o.deliveredAt!,
    arrivedAt: o.arrivedAt ?? null,
    atLocation: secondsBetween(o.arrivedAt ?? undefined, o.deliveredAt ?? undefined),
    delta:     minutesBetween(i === 0 ? routeStartAt : deliveredOrders[i - 1]!.deliveredAt!, o.deliveredAt!),
  }))
  const totalMinutes = route.finishedAt ? minutesBetween(routeStartAt, route.finishedAt) : null
  const showTimeline = Boolean(route.startedAt) || timeline.length > 0

  return (
    <div className="p-6 max-w-4xl">
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
          {route.finishedAt && (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Finalizada em {new Date(route.finishedAt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLOR[route.status]}`}>
            {STATUS_LABEL[route.status]}
          </span>
          {route.status === 'CREATED' && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar rota
            </button>
          )}
          {route.status !== 'FINISHED' && can({ scope: 'routes:force_finish' }) && (
            <button
              onClick={forceFinish}
              disabled={finishing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Flag className="h-3.5 w-3.5" />
              {finishing ? 'Finalizando…' : 'Forçar finalização'}
            </button>
          )}
        </div>
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

      {/* Map */}
      {mapData && (mapData.orders.some(o => o.lat && o.lng) || mapData.trail.length >= 2) && (
        <div className="isolate mb-6 overflow-hidden rounded-2xl border border-gray-200 shadow-sm" style={{ height: 360 }}>
          <RouteMap
            orders={mapData.orders.filter(o => o.lat != null && o.lng != null)}
            trail={mapData.trail}
          />
        </div>
      )}

      {/* Timeline vertical: início → entregas (com delta) → finalização (com total) */}
      {showTimeline && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
            Linha do tempo
          </h2>
          <ol className="relative">
            <span
              aria-hidden
              className="absolute left-[6px] top-2 bottom-2 w-px bg-gray-200"
            />

            {/* Início da rota */}
            <li className="relative pl-6 pb-5">
              <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-500 ring-1 ring-blue-200" />
              <p className="text-sm font-medium text-gray-900">Rota iniciada</p>
              <p className="text-xs text-gray-500">{fmtDateTime(routeStartAt) ?? '—'}</p>
            </li>

            {/* Entregas */}
            {timeline.map((t) => (
              <li key={t.id} className="relative pl-6 pb-5">
                <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-green-500 ring-1 ring-green-200" />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900">{t.label}</p>
                    {t.arrivedAt && (
                      <p className="text-xs text-gray-500">Chegou às {fmtDateTime(t.arrivedAt)}</p>
                    )}
                    <p className="text-xs text-gray-500">Entregue às {fmtDateTime(t.at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {t.delta != null && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                        +{t.delta} min
                      </span>
                    )}
                    {t.atLocation != null && (
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          t.atLocation >= 300 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                        }`}
                        title="Tempo entre chegar ao endereço e marcar como entregue"
                      >
                        no local: {fmtGap(t.atLocation)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}

            {/* Finalização */}
            {route.finishedAt ? (
              <li className="relative pl-6">
                <span className="absolute left-0 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 ring-1 ring-green-200">
                  <Flag className="h-2 w-2 text-white" />
                </span>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-green-700">Rota finalizada</p>
                    <p className="text-xs text-gray-500">{fmtDateTime(route.finishedAt)}</p>
                  </div>
                  {totalMinutes != null && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                      Total {totalMinutes} min
                    </span>
                  )}
                </div>
              </li>
            ) : (
              <li className="relative pl-6">
                <span className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-gray-300" />
                <p className="text-sm text-gray-400">Rota em andamento…</p>
              </li>
            )}
          </ol>
        </div>
      )}

      {/* Orders list */}
      <h2 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
        Pedidos desta rota
      </h2>

      {editing ? (
        <RouteEditor
          route={route}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false)
            await Promise.all([mutate(), mutateMap()])
          }}
        />
      ) : route.orders.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Nenhum pedido vinculado.</p>
      ) : (
        <div className="space-y-3">
          {route.orders.map((order, i) => (
            <div
              key={order.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-all hover:border-gray-300 hover:shadow-sm"
            >
            <Link
              href={`/orders/${order.id}`}
              className="flex items-start gap-4 p-4 transition-colors hover:bg-gray-50"
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
                  {order.deliveredOffTarget && (
                    <span
                      title="Entregue fora do local da entrega (> 100m)"
                      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Fora do local
                    </span>
                  )}
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

                {/* Datas/horas: criação, retirada, chegada e entrega */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>Criação: <span className="text-gray-700">{fmtDateTime(order.createdAt) ?? '—'}</span></span>
                  <span>Retirada: <span className="text-gray-700">{fmtDateTime(order.pickedUpAt) ?? '—'}</span></span>
                  {order.arrivedAt && (
                    <span>Chegada: <span className="text-gray-700">{fmtDateTime(order.arrivedAt)}</span></span>
                  )}
                  <span>Entrega: <span className="text-gray-700">{fmtDateTime(order.deliveredAt) ?? '—'}</span></span>
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
            </Link>
            {!COMPLETED_ORDER_STATUSES.includes(order.status) && (
              <div className="border-t border-gray-100 px-4 py-2">
                <button
                  onClick={() => setAdjustingOrder({ id: order.id, address: order.customerAddress })}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Ajustar endereço de entrega
                </button>
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {adjustingOrder && (
        <AdjustAddressModal
          orderId={adjustingOrder.id}
          currentAddress={adjustingOrder.address}
          onClose={() => setAdjustingOrder(null)}
          onChanged={async () => {
            setAdjustingOrder(null)
            await Promise.all([mutate(), mutateMap()])
          }}
        />
      )}
    </div>
  )
}
