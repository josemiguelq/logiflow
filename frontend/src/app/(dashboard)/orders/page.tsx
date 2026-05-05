'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, ChevronDown } from 'lucide-react'
import { Order, OrderStatus, Deliverer } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/orders/order-card'
import { Button } from '@/components/ui/button'
import { STATUS_LABELS } from '@/lib/utils'
import { NewOrderModal } from '@/components/orders/new-order-modal'
import { AssignModal } from '@/components/orders/assign-modal'

const STATUSES: (OrderStatus | '')[] = [
  '', 'PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]

export default function OrdersPage() {
  const { user }  = useAuth()
  const { on }    = useWebSocket(user?.storeId)

  const [status,      setStatus]      = useState<OrderStatus | ''>('')
  const [delivererId, setDelivererId] = useState('')
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [assigning,    setAssigning]    = useState<Order | null>(null)

  // Monta a URL com os filtros ativos
  const params = new URLSearchParams()
  if (status)      params.set('status',      status)
  if (delivererId) params.set('delivererId', delivererId)
  const url = `/orders${params.size ? `?${params}` : ''}`

  const { data: orders = [],    mutate } = useSWR(url, (u: string) => api.get<Order[]>(u), {
    refreshInterval: 30_000,
  })
  const { data: deliverers = [] }        = useSWR('/deliverers', (u: string) => api.get<Deliverer[]>(u))

  useEffect(() => on('order_updated', () => mutate()), [on, mutate])

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/cancel`)
    mutate()
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="mt-0.5 text-sm text-gray-500">{orders.length} pedido(s)</p>
        </div>
        <Button onClick={() => setShowNewOrder(true)}>
          <Plus className="h-4 w-4" />
          Novo Pedido
        </Button>
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Status pills */}
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

        {/* Filtro por entregador */}
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
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        )}
      </div>

      {/* Grid de pedidos */}
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
