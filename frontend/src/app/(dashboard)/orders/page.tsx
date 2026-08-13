'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Plus, ChevronDown, LayoutGrid, Map, CheckSquare, Check, Truck, Trash2, Loader2, Search, X, AlertTriangle, BellRing, Building2 } from 'lucide-react'
import { Order, OrderStatus, Deliverer, OrderUnread, ChatMessage } from '@/types'
import { api } from '@/lib/api'
import { useWs } from '@/hooks/WsContext'
import { useAccess } from '@/hooks/useAccess'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'
import { OrderCard } from '@/components/orders/order-card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { STATUS_LABELS, formatDate, getDelayInfo } from '@/lib/utils'
import { useDelayThresholds } from '@/hooks/useDelayThresholds'
import { NewOrderModal } from '@/components/orders/new-order-modal'
import { AssignModal } from '@/components/orders/assign-modal'
import { CancelOrderModal } from '@/components/orders/cancel-order-modal'
import { OrderChatModal } from '@/components/orders/order-chat-modal'
import { LiveMap, MapDestination } from '@/components/map'

const STATUSES: (OrderStatus | '')[] = [
  '', 'PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]

const COMPLETED_STATUSES: OrderStatus[] = ['DELIVERED', 'CANCELLED']

function paymentDiscrepancy(order: Order): { collected: number; expected: number } | null {
  // A divergência (SHORT_PAYMENT) já é calculada na entrega e persistida no
  // summary — a listagem não carrega mais os pagamentos individuais.
  const sp = order.summary?.inconsistencies?.find(i => i.type === 'SHORT_PAYMENT')
  if (!sp) return null
  return { collected: Number(sp.details.collected), expected: Number(sp.details.expected) }
}

export default function OrdersPage() {
    const { on, onReconnect } = useWs()
  const router     = useRouter()
  const { can }    = useAccess()

  const [status,       setStatus]       = useState<OrderStatus | ''>('')
  const [delivererId,  setDelivererId]  = useState('')
  const [search,       setSearch]       = useState('')
  const [agencyOnly,   setAgencyOnly]   = useState(false)
  const [showNewOrder,    setShowNewOrder]    = useState(false)
  const [assigning,       setAssigning]       = useState<Order | null>(null)
  const [cancelling,      setCancelling]      = useState<Order | null>(null)
  const [view,            setView]            = useState<'cards' | 'map'>('cards')
  const [deletingOrder,   setDeletingOrder]   = useState<Order | null>(null)
  const [deleteLoading,   setDeleteLoading]   = useState(false)
  // Batch assign
  const [batchMode,        setBatchMode]        = useState(false)
  const [batchSelected,    setBatchSelected]    = useState<string[]>([])
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

  // Resumo de atrasos (limiar vermelho) + contagem de entregadores para o alerta.
  interface PickupAlert {
    pickupDelayed: number
    deliveryDelayed: number
    prepRedMin: number
    deliverers: { available: number; active: number; inRoute: number; idle: number }
  }
  const { data: pickupAlert, isLoading: pickupLoading } = useSWR<PickupAlert>(
    '/orders/pickup-alert',
    (u: string) => api.get<PickupAlert>(u),
    { refreshInterval: 30_000 },
  )
  const pickupDelayed   = pickupAlert?.pickupDelayed ?? 0
  const deliveryDelayed = pickupAlert?.deliveryDelayed ?? 0
  const totalDelayed    = pickupDelayed + deliveryDelayed
  const delivererCounts = pickupAlert?.deliverers ?? { available: 0, active: 0, inRoute: 0, idle: 0 }

  const [showDetails,  setShowDetails]  = useState(false)
  const [notifying,    setNotifying]    = useState(false)
  const [notifyResult, setNotifyResult] = useState<string | null>(null)

  async function handleNotifyPickup() {
    setNotifying(true)
    setNotifyResult(null)
    try {
      const res = await api.post<{ notified: number; count: number }>('/orders/notify-pickup', {})
      setNotifyResult(
        res.notified > 0
          ? `Push enviado a ${res.notified} entregador${res.notified !== 1 ? 'es' : ''} ✓`
          : 'Nenhum entregador sem rota no momento',
      )
    } finally {
      setNotifying(false)
    }
  }

  // Chat: feature controlada pelo superadmin. Só busca/exibe quando habilitada.
  const { chatEnabled } = useStoreFeatures()
  const [chatOrder, setChatOrder] = useState<Order | null>(null)
  const { data: unreadList = [], mutate: mutateUnread } = useSWR<OrderUnread[]>(
    chatEnabled ? '/orders/chat/unread' : null,
    (u: string) => api.get<OrderUnread[]>(u),
    { refreshInterval: 30_000 },
  )
  const unreadMap: Record<string, number> = Object.fromEntries(unreadList.map(u => [u.orderId, u.count]))

  useEffect(() => on('order_updated', () => mutate()), [on, mutate])
  useEffect(() => onReconnect(() => { mutate(); mutateUnread() }), [onReconnect, mutate, mutateUnread])

  // Nova mensagem no chat: atualiza o badge e notifica o operador (mensagens do
  // entregador). Se o chat do pedido já estiver aberto, o próprio modal lida.
  useEffect(
    () => on('order_message', (data) => {
      const msg = data as ChatMessage
      if (msg.senderType !== 'deliverer') return
      mutateUnread()
      if (chatOrder?.id === msg.orderId) return
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Nova mensagem 💬', { body: msg.body })
      }
    }),
    [on, mutateUnread, chatOrder],
  )
  // Outro operador marcou como lido → sincroniza o badge.
  useEffect(() => on('order_message_read', () => mutateUnread()), [on, mutateUnread])

  // Pede permissão de notificação do browser uma vez.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [])

  // Search by customer name + filtro "Via agência" (terceirizada), client-side.
  const query = search.trim().toLowerCase()
  const filteredOrders = orders.filter(o =>
    (!query || o.customer.name.toLowerCase().includes(query)) &&
    (!agencyOnly || o.thirdPartyDelivery)
  )

  // Split active (cards) vs completed (table). Table shows only orders created today.
  const isToday = (d: string) => new Date(d).toDateString() === new Date().toDateString()

  // Atrasados primeiro: ordena por severidade (vermelho > amarelo > nenhum) e,
  // dentro do mesmo nível, pelos mais atrasados. Mesma lógica usada nos cards.
  // `now` é reavaliado a cada render (a lista recarrega via SWR a cada 30s).
  const now = Date.now()
  const delayThresholds = useDelayThresholds()
  const delayRank = (o: Order) => {
    const d = getDelayInfo(o, delayThresholds, now)
    return d.level === 'red' ? 2 : d.level === 'yellow' ? 1 : 0
  }
  // Fila de "Preparando" no topo: prioritários primeiro, depois os normais;
  // demais status (em rota, etc.) vêm em seguida.
  const preparingRank = (o: Order) => {
    if (o.status !== 'PREPARING') return 0
    return o.isPriority ? 2 : 1
  }
  const activeOrders = filteredOrders
    .filter(o => !COMPLETED_STATUSES.includes(o.status))
    .sort((a, b) => {
      const pa = preparingRank(a), pb = preparingRank(b)
      if (pa !== pb) return pb - pa
      const ra = delayRank(a), rb = delayRank(b)
      if (ra !== rb) return rb - ra
      if (ra === 0) return 0 // preserva ordem original entre não-atrasados (sort estável)
      return getDelayInfo(b, delayThresholds, now).minutes - getDelayInfo(a, delayThresholds, now).minutes
    })
  const completedOrders = filteredOrders.filter(o =>
    COMPLETED_STATUSES.includes(o.status) && isToday(o.createdAt)
  )

  // Map: all non-delivered orders with coordinates
  const { data: allOrders = [] } = useSWR(
    view === 'map' ? '/orders' : null,
    (u: string) => api.get<Order[]>(u),
    { refreshInterval: 30_000 }
  )

  // Alvo de entrega: agência (terceirizada) quando presente, senão o cliente.
  const targetLat = (o: Order) => o.agency?.lat ?? o.customer.lat
  const targetLng = (o: Order) => o.agency?.lng ?? o.customer.lng
  const targetAddr = (o: Order) => o.agency ? `${o.agency.name} · ${o.agency.address}` : o.customer.address

  const mapOrders = (view === 'map' ? allOrders : orders)
    .filter(o => !COMPLETED_STATUSES.includes(o.status) && targetLat(o) != null)
    .filter(o => !query || o.customer.name.toLowerCase().includes(query))
    .filter(o => !agencyOnly || o.thirdPartyDelivery)

  const mapDestinations: MapDestination[] = mapOrders
    .map(o => ({
      id:     o.id,
      lat:    targetLat(o)!,
      lng:    targetLng(o)!,
      label:  `${o.customer.name} · ···${o.customer.phone.slice(-4)} · #${o.id.slice(-8).toUpperCase()}`,
      status: `${STATUS_LABELS[o.status]}${o.deliverer ? ` · ${o.deliverer.name}` : ''} · ${targetAddr(o)}`,
      selectable:     batchMode && o.status === 'PREPARING',
      selected:       batchSelected.includes(o.id),
      markerColor:    o.status === 'PREPARING' ? (batchMode && batchSelected.includes(o.id) ? 'blue' : 'gray') : 'red',
      selectionOrder: batchMode && batchSelected.includes(o.id) ? batchSelected.indexOf(o.id) + 1 : undefined,
    }))


  async function handleDelete(order: Order) {
    setDeletingOrder(order)
  }

  async function confirmDelete() {
    if (!deletingOrder) return
    setDeleteLoading(true)
    try {
      await api.delete(`/orders/${deletingOrder.id}`)
      setDeletingOrder(null)
      mutate()
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleSaveNote(orderId: string, note: string) {
    await api.patch(`/orders/${orderId}/note`, { note })
    mutate()
  }

  function toggleBatchSelect(id: string) {
    setBatchSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function exitBatchMode() {
    setBatchMode(false)
    setBatchSelected([])
    setBatchDelivererId('')
  }

  async function handleBatchAssign() {
    if (!batchDelivererId || batchSelected.length === 0) return
    setBatchLoading(true)
    try {
      const result = await api.post<{ route: { id: string }; orders: unknown[] }>(
        '/orders/batch-assign',
        { orderIds: batchSelected, delivererId: batchDelivererId }
      )
      exitBatchMode()
      router.push(`/routes/${result.route.id}`)
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
            <h1 className="text-2xl font-bold text-gray-900">Em Andamento</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {query ? `${filteredOrders.length} de ${orders.length}` : orders.length} pedido(s)
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              Entregadores:
              {pickupLoading ? (
                <>
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                  <Skeleton className="h-5 w-28 rounded-full" />
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {delivererCounts.available} disponível(is)
                  </span>
                  <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 font-medium text-orange-700">
                    {delivererCounts.inRoute} com rota ativa
                  </span>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 font-medium text-blue-700">
                    {delivererCounts.idle} sem rota ativa
                  </span>
                </>
              )}
            </div>
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

            <Button onClick={() => setShowNewOrder(true)} data-testid="orders-new">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Pedido</span>
            </Button>
          </div>
        </div>

        {/* Search by customer name */}
        <div className="relative mb-3 w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome do cliente..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-9 text-sm text-gray-700 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filtro "Via agência" (terceirizada) — disponível em ambas as visões */}
        <button
          onClick={() => setAgencyOnly(v => !v)}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          style={agencyOnly
            ? { borderColor: '#6366F1', color: '#4338CA', background: '#EEF2FF' }
            : { borderColor: '#E5E7EB', color: '#4B5563', background: '#fff' }}
          title="Mostrar apenas pedidos de entrega terceirizada (via agência/parceiro)"
        >
          <Building2 className="h-3.5 w-3.5" />
          Via agência
        </button>

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
              <div>Selecione no mapa pedidos em <strong>Preparando</strong> para atribuir em lote.</div>
              <div className="mt-1 text-[11px] text-blue-600/90">
                Legenda: <strong>cinza</strong> = PREPARING, <strong>azul</strong> = PREPARING selecionado, <strong>vermelho</strong> = demais status.
              </div>
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

          {/* Alerta de pedidos atrasados — só quando houver mais de 3 atrasados */}
          {totalDelayed > 3 && (
            <div className="mb-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
              <div className="flex-1">
                <span className="font-semibold">{totalDelayed} pedidos atrasados</span>
                <span className="text-red-600/90">
                  {' '}({pickupDelayed} para retirar · {deliveryDelayed} para entregar)
                </span>
              </div>
              <button
                onClick={() => { setNotifyResult(null); setShowDetails(true) }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
              >
                Detalhes
              </button>
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
                    const selected   = batchSelected.includes(order.id)
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
                            onCancel={!batchMode ? () => setCancelling(order) : undefined}
                            onSaveNote={!batchMode ? (note) => handleSaveNote(order.id, note) : undefined}
                            onDelete={!batchMode && can({ scope: 'orders:delete' }) ? () => handleDelete(order) : undefined}
                            onOpenChat={chatEnabled && !batchMode ? () => setChatOrder(order) : undefined}
                            unreadCount={unreadMap[order.id] ?? 0}
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
                      Concluídos hoje
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
                          <th className="px-4 py-2.5 text-left">Datas</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {completedOrders.map(order => (
                          <tr key={order.id} className="transition-colors hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                            <Link
                                  href={`/orders/${order.id}`}
                                  className="font-mono text-xs font-semibold text-gray-700"                                  
                                >#{order.id.slice(-8).toUpperCase()}
                                </Link>
                            </td>
                            <td className="px-4 py-2.5 text-gray-800">{order.customer.name}</td>
                            <td className="hidden sm:table-cell px-4 py-2.5 max-w-[200px]">
                              <span className="block truncate text-gray-500">
                                {order.agency ? `${order.agency.name} · ${order.agency.address}` : order.customer.address}
                              </span>
                            </td>
                            <td className="hidden md:table-cell px-4 py-2.5 text-gray-500">
                              {order.deliverer?.name ?? '—'}
                            </td>
                            <td className="px-4 py-2.5">
                              <StatusBadge status={order.status} />
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-400 whitespace-nowrap">
                              <div className="space-y-0.5">
                                {order.deliveredAt && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-green-600 font-medium">Entregue</span>
                                    <span>{formatDate(order.deliveredAt)}</span>
                                  </div>
                                )}
                                {order.pickedUpAt && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-blue-500 font-medium">Recolhido</span>
                                    <span>{formatDate(order.pickedUpAt)}</span>
                                  </div>
                                )}
                                {!order.deliveredAt && !order.pickedUpAt && (
                                  <span>{formatDate(order.createdAt)}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {paymentDiscrepancy(order) && (
                                  <span
                                    className="inline-flex"
                                    title={`Valor recebido (${paymentDiscrepancy(order)!.collected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) menor que o esperado (${paymentDiscrepancy(order)!.expected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
                                  >
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                  </span>
                                )}
                                <Link
                                  href={`/orders/${order.id}`}
                                  className="text-xs font-medium hover:underline"
                                  style={{ color: 'var(--color-primary)' }}
                                >
                                  Ver
                                </Link>
                                {can({ scope: 'orders:delete' }) && (
                                  <button
                                    onClick={() => handleDelete(order)}
                                    className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    title="Excluir pedido"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
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
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-2xl md:left-64">
          <div className="mx-auto flex max-w-screen-xl items-center gap-3 px-4 py-3 sm:px-6">
            <span className="shrink-0 text-sm font-medium text-gray-700">
              {batchSelected.length} selecionado(s)
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
              disabled={!batchDelivererId || batchSelected.length === 0 || batchLoading}
            >
              <Truck className="h-4 w-4" />
              {batchLoading ? 'Atribuindo...' : `Atribuir (${batchSelected.length})`}
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
          onAssigned={(routeId) => { setAssigning(null); router.push(`/routes/${routeId}`) }}
        />
      )}
      {cancelling && (
        <CancelOrderModal
          order={cancelling}
          onClose={() => setCancelling(null)}
          onCancelled={() => { setCancelling(null); mutate() }}
        />
      )}

      {chatEnabled && chatOrder && (
        <OrderChatModal
          order={chatOrder}
          onClose={() => setChatOrder(null)}
          onRead={() => mutateUnread()}
        />
      )}

      {/* Popup de detalhes do alerta de atrasos */}
      {showDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Pedidos atrasados</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {totalDelayed} pedido{totalDelayed !== 1 ? 's' : ''} atrasado{totalDelayed !== 1 ? 's' : ''} ·{' '}
                  {pickupDelayed} para retirar · {deliveryDelayed} para entregar.
                </p>
              </div>
            </div>

            <div className="mb-5 divide-y divide-gray-100 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-600">Entregadores ativos</span>
                <span className="font-semibold text-gray-900">{delivererCounts.active}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-600">Em rota ativa</span>
                <span className="font-semibold text-gray-900">{delivererCounts.inRoute}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-600">Sem rota ativa</span>
                <span className="font-semibold text-gray-900">{delivererCounts.idle}</span>
              </div>
            </div>

            {notifyResult && (
              <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-center text-sm font-medium text-gray-700">
                {notifyResult}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={handleNotifyPickup}
                disabled={notifying}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {notifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                Notificar entregadores para retirar
              </button>
              <button
                onClick={() => setShowDetails(false)}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Excluir pedido</h2>
                <p className="mt-1 text-sm text-gray-500">
                  O pedido{' '}
                  <span className="font-mono font-bold">#{deletingOrder.id.slice(-8).toUpperCase()}</span>{' '}
                  de <span className="font-medium">{deletingOrder.customer.name}</span> será excluído permanentemente.
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingOrder(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteLoading ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
