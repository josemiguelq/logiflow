'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, ChevronDown, LayoutGrid, Map, CheckSquare, Check, Truck } from 'lucide-react'
import { Order, OrderStatus, Deliverer } from '@/types'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useWebSocket } from '@/hooks/useWebSocket'
import { OrderCard } from '@/components/orders/order-card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { STATUS_LABELS, formatDate } from '@/lib/utils'
import { NewOrderModal } from '@/components/orders/new-order-modal'
import { AssignModal } from '@/components/orders/assign-modal'
import { LiveMap, MapDestination } from '@/components/map'

const STATUSES: (OrderStatus | '')[] = [
  '', 'PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]

const COMPLETED_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED']

export default function OrdersPage() {
  const { user } = useAuth()
  const { on }   = useWebSocket(user?.storeId)

  const [status,       setStatus]       = useState<OrderStatus | ''>('')
  const [delivererId,  setDelivererId]  = useState('')
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [assigning,    setAssigning]    = useState<Order | null>(null)
  const [view,         setView]         = useState<'cards' | 'map'>('cards')

  // Batch assign
  const [batchMode,        setBatchMode]        = useState(false)
  const [batchSelected,    setBatchSelected]    = useState<Set<string>>(new Set())
  const [batchDelivererId, setBatchDelivererId] = useState('')
  const [batchLoading,     setBatchLoading]     = useState(false)

  const params = new URLSearchParams()
  if (status)      params.set('status',      status)
  if (delivererId) params.set('delivererId', delivererId)
  const url = `/orders${params.size ? `?${params}` : ''}`

  const { data: orders = [], mutate } = useSWR(url, (u: string) => api.get<Order[]>(u), {
    refreshInterval: 30_000,
  })
  const { data: deliverers = [] } = useSWR('/deliverers', (u: string) => api.get<Deliverer[]>(u))

  useEffect(() => on('order_updated', () => mutate()), [on, mutate])

  // Split active (cards) vs completed (table)
  const activeOrders    = orders.filter(o => !COMPLETED_STATUSES.includes(o.status))
  const completedOrders = orders.filter(o =>  COMPLETED_STATUSES.includes(o.status))

  // Map: all non-delivered orders with coordinates
  const { data: allOrders = [] } = useSWR(
    view === 'map' ? '/orders' : null,
    (u: string) => api.get<Order[]>(u),
    { refreshInterval: 30_000 }
  )

  const mapOrders = (view === 'map' ? allOrders : orders)
    .filter(o => !COMPLETED_STATUSES.includes(o.status) && o.customer.lat != null)

  const mapDestinations: MapDestination[] = mapOrders
    .map(o => ({
      id:     o.id,
      lat:    o.customer.lat!,
      lng:    o.customer.lng!,
      label:  `${o.customer.name} · #${o.id.slice(-8).toUpperCase()}`,
      status: `${STATUS_LABELS[o.status]}${o.deliverer ? ` · ${o.deliverer.name}` : ''} · ${o.customer.address}`,
      selectable: batchMode && o.status === 'PREPARING',
      selected:   batchSelected.has(o.id),
    }))

  async function handleCancel(orderId: string) {
    await api.patch(`/orders/${orderId}/cancel`)
    mutate()
  }

  function toggleBatchSelect(id: string) {
    setBatchSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exitBatchMode() {
    setBatchMode(false)
    setBatchSelected(new Set())
    setBatchDelivererId('')
  }

  async function handleBatchAssign() {
    if (!batchDelivererId || batchSelected.size === 0) return
    setBatchLoading(true)
    try {
      await api.post('/orders/batch-assign', {
        orderIds:    Array.from(batchSelected),
        delivererId: batchDelivererId,
      })
      mutate()
      exitBatchMode()
    } finally {
      setBatchLoading(false)
    }
  }

  return (
    <div className={`flex h-full flex-col${batchMode ? ' pb-20' : ''}`}>

      {/* ── Header ── */}
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
                  view === 'cards' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Cards</span>
              </button>
              <button
                onClick={() => setView('map')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === 'map' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Map className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mapa</span>
              </button>
            </div>

            {/* Batch assign toggle */}
            <button
              onClick={() => batchMode ? exitBatchMode() : setBatchMode(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
              style={
                batchMode
                  ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 8%, white)' }
                  : { borderColor: '#E5E7EB', color: '#4B5563', background: 'white' }
              }
            >
              <CheckSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Atribuição em lote</span>
            </button>

            <Button onClick={() => setShowNewOrder(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Pedido</span>
            </Button>
          </div>
        </div>

        {/* Filters */}
        {view === 'cards' && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {STATUSES.map(s => (
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
                  onChange={e => setDelivererId(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 sm:w-auto"
                  style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                >
                  <option value="">Todos os entregadores</option>
                  {deliverers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {view === 'map' ? (
        <div className="relative flex-1">
          {batchMode && (
            <div className="absolute left-4 top-4 z-20 max-w-[24rem] rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 shadow-sm">
              Selecione no mapa pedidos em <strong>Preparando</strong> para atribuir em lote.
            </div>
          )}
          {mapDestinations.length === 0 && (
            <div className="absolute inset-x-0 top-4 z-10 mx-auto flex w-fit items-center gap-2 rounded-full border border-yellow-200 bg-yellow-50 px-4 py-2 text-xs text-yellow-700 shadow-sm">
              Nenhum pedido ativo com localização cadastrada
            </div>
          )}
          <LiveMap
            destinations={mapDestinations}
            autoFitBounds
            height="100%"
            onDestinationClick={(id) => {
              if (!batchMode) return
              const order = mapOrders.find((o) => o.id === id)
              if (!order || order.status !== 'PREPARING') return
              toggleBatchSelect(order.id)
            }}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">

          {/* Batch mode hint banner */}
          {batchMode && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
              <CheckSquare className="h-4 w-4 shrink-0" />
              <span>Clique nos pedidos em <strong>Preparando</strong> para selecioná-los e atribuir em lote.</span>
            </div>
          )}

          {activeOrders.length === 0 && completedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 py-16 text-gray-400">
              <p className="text-lg font-medium">Nenhum pedido encontrado</p>
              <p className="mt-1 text-sm">Ajuste os filtros ou crie um novo pedido</p>
            </div>
          ) : (
            <>
              {/* Active orders — card grid */}
              {activeOrders.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {activeOrders.map(order => {
                    const selectable = batchMode && order.status === 'PREPARING'
                    const selected   = batchSelected.has(order.id)
                    return (
                      <div
                        key={order.id}
                        className="relative"
                        onClick={selectable ? () => toggleBatchSelect(order.id) : undefined}
                        style={selectable ? { cursor: 'pointer' } : undefined}
                      >
                        {selectable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleBatchSelect(order.id)
                            }}
                            className={`absolute right-3 top-3 z-20 flex h-5 w-5 items-center justify-center rounded border-2 bg-white transition-all ${
                              selected ? 'border-transparent' : 'border-gray-300'
                            }`}
                            style={selected ? { background: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : undefined}
                            aria-label={selected ? 'Desmarcar pedido' : 'Selecionar pedido'}
                          >
                            {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </button>
                        )}
                        <div
                          className={selectable ? '[&_*]:pointer-events-none' : undefined}
                          style={selected ? { outline: '2px solid var(--color-primary)', outlineOffset: '2px', borderRadius: '0.75rem' } : undefined}
                        >
                          <OrderCard
                            order={order}
                            onAssign={!batchMode ? () => setAssigning(order) : undefined}
                            onCancel={!batchMode ? () => handleCancel(order.id) : undefined}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Completed orders — compact table */}
              {completedOrders.length > 0 && (
                <section className="mt-8">
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Histórico
                    </h2>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                      {completedOrders.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-medium text-gray-400">
                          <th className="px-4 py-2.5 text-left">Pedido</th>
                          <th className="px-4 py-2.5 text-left">Cliente</th>
                          <th className="hidden sm:table-cell px-4 py-2.5 text-left">Endereço</th>
                          <th className="hidden md:table-cell px-4 py-2.5 text-left">Entregador</th>
                          <th className="px-4 py-2.5 text-left">Status</th>
                          <th className="px-4 py-2.5 text-left">Data</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedOrders.map(order => (
                          <tr key={order.id} className="transition-colors hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-gray-700">
                              #{order.id.slice(-8).toUpperCase()}
                            </td>
                            <td className="px-4 py-2.5 text-gray-800">{order.customer.name}</td>
                            <td className="hidden sm:table-cell px-4 py-2.5 max-w-[200px]">
                              <span className="block truncate text-gray-500">{order.customer.address}</span>
                            </td>
                            <td className="hidden md:table-cell px-4 py-2.5 text-gray-500">
                              {order.deliverer?.name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                              {formatDate(order.createdAt)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Link
                                href={`/orders/${order.id}`}
                                className="text-xs font-medium hover:underline"
                                style={{ color: 'var(--color-primary)' }}
                              >
                                Ver
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Batch assign sticky bar ── */}
      {batchMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white shadow-2xl">
          <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-3 sm:px-6">
            <span className="shrink-0 text-sm font-medium text-gray-700">
              {batchSelected.size} selecionado(s)
            </span>
            <div className="relative flex-1 sm:w-56 sm:flex-none">
              <select
                value={batchDelivererId}
                onChange={e => setBatchDelivererId(e.target.value)}
                className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
              >
                <option value="">Selecionar entregador...</option>
                {deliverers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
            <Button
              onClick={handleBatchAssign}
              disabled={!batchDelivererId || batchSelected.size === 0 || batchLoading}
            >
              <Truck className="h-4 w-4" />
              {batchLoading ? 'Atribuindo...' : `Atribuir (${batchSelected.size})`}
            </Button>
            <button
              onClick={exitBatchMode}
              className="shrink-0 text-sm text-gray-500 underline hover:text-gray-700"
            >
              Cancelar
            </button>
          </div>
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
