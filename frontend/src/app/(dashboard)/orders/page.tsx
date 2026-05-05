'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, ChevronDown, LayoutGrid, Map } from 'lucide-react'
import { Order, OrderStatus, Deliverer } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/orders/order-card'
import { Button } from '@/components/ui/button'
import { STATUS_LABELS } from '@/lib/utils'
import { NewOrderModal } from '@/components/orders/new-order-modal'
import { AssignModal } from '@/components/orders/assign-modal'
import { LiveMap, MapDestination } from '@/components/map'

const STATUSES: (OrderStatus | '')[] = [
  '', 'PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]

const ACTIVE_STATUSES: OrderStatus[] = ['ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY']

export default function OrdersPage() {
  const { user }  = useAuth()
  const { on }    = useWebSocket(user?.storeId)

  const [status,      setStatus]      = useState<OrderStatus | ''>('')
  const [delivererId, setDelivererId] = useState('')
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [assigning,    setAssigning]    = useState<Order | null>(null)
  const [view,         setView]         = useState<'cards' | 'map'>('cards')

  const params = new URLSearchParams()
  if (status)      params.set('status',      status)
  if (delivererId) params.set('delivererId', delivererId)
  const url = `/orders${params.size ? `?${params}` : ''}`

  const { data: orders = [],    mutate } = useSWR(url, (u: string) => api.get<Order[]>(u), {
    refreshInterval: 30_000,
  })
  const { data: deliverers = [] } = useSWR('/deliverers', (u: string) => api.get<Deliverer[]>(u))

  useEffect(() => on('order_updated', () => mutate()), [on, mutate])

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/cancel`)
    mutate()
  }

  // For the map view: all active orders (across all filters) that have coordinates
  const { data: allOrders = [] } = useSWR(
    view === 'map' ? '/orders' : null,
    (u: string) => api.get<Order[]>(u),
    { refreshInterval: 30_000 }
  )

  const mapDestinations: MapDestination[] = (view === 'map' ? allOrders : orders)
    .filter((o) => ACTIVE_STATUSES.includes(o.status) && o.customer.lat != null)
    .map((o) => ({
      lat:   o.customer.lat!,
      lng:   o.customer.lng!,
      label: `${o.customer.name} — ${STATUS_LABELS[o.status]}${o.deliverer ? ` · ${o.deliverer.name}` : ''}`,
      status: o.customer.address,
    }))

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
            <p className="mt-0.5 text-sm text-gray-500">{orders.length} pedido(s)</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
              <button
                onClick={() => setView('cards')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'cards'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'map'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Map className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mapa</span>
              </button>
            </div>

            <Button onClick={() => setShowNewOrder(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Pedido</span>
            </Button>
          </div>
        </div>

        {/* Filtros (hidden in map view) */}
        {view === 'cards' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className="shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors"
                  style={
                    status === s
                      ? { background: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                      : { background: '#fff', color: '#4B5563', borderColor: '#E5E7EB' }
                  }
                >
                  {s === '' ? 'Todos' : STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {deliverers.length > 0 && (
              <div className="relative sm:ml-auto">
                <select
                  value={delivererId}
                  onChange={(e) => setDelivererId(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 sm:w-auto"
                  style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                >
                  <option value="">Todos os entregadores</option>
                  {deliverers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      {view === 'map' ? (
        <div className="relative flex-1">
          {mapDestinations.length === 0 && (
            <div className="absolute inset-x-0 top-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-700 shadow-sm">
              Nenhuma entrega em andamento com localização cadastrada
            </div>
          )}
          <LiveMap
            destinations={mapDestinations}
            autoFitBounds
            height="100%"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-gray-400">
              <p className="text-lg font-medium">Nenhum pedido encontrado</p>
              <p className="mt-1 text-sm">Ajuste os filtros ou crie um novo pedido</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onAssign={() => setAssigning(order)}
                  onCancel={() => handleCancel(order.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showNewOrder && (
        <NewOrderModal
          onClose={() => setShowNewOrder(false)}
          onCreated={() => { setShowNewOrder(false); mutate() }}
        />
      )}

      {assigning && (
        <AssignModal
          order={assigning}
          onClose={() => setAssigning(null)}
          onAssigned={() => { setAssigning(null); mutate() }}
        />
      )}
    </div>
  )
}
