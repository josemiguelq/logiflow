'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, MapPin, Plus, X, Check, Loader2, AlertTriangle, Lock,
} from 'lucide-react'
import { DeliveryRoute, Order } from '@/types'
import { api } from '@/lib/api'
import { LiveMap, MapDestination } from '@/components/map'
import { Button } from '@/components/ui/button'

const LOCKED_STATUSES = new Set(['DELIVERED', 'CANCELLED'])

interface EditItem {
  id: string
  customerName: string
  customerAddress: string
  status: string
  isNew: boolean
}

interface Props {
  route: DeliveryRoute
  onCancel: () => void
  onSaved: () => void
}

export function RouteEditor({ route, onCancel, onSaved }: Props) {
  const sortedOrders = useMemo(
    () => [...route.orders].sort((a, b) => (a.routePosition ?? 0) - (b.routePosition ?? 0)),
    [route.orders]
  )

  // Finished orders are pinned at the top, dimmed and non-draggable.
  const lockedItems = useMemo(
    () => sortedOrders.filter(o => LOCKED_STATUSES.has(o.status)),
    [sortedOrders]
  )
  const initialSortable = useMemo<EditItem[]>(
    () => sortedOrders
      .filter(o => !LOCKED_STATUSES.has(o.status))
      .map(o => ({
        id: o.id,
        customerName: o.customerName,
        customerAddress: o.customerAddress,
        status: o.status,
        isNew: false,
      })),
    [sortedOrders]
  )

  const [items, setItems]           = useState<EditItem[]>(initialSortable)
  const [showMap, setShowMap]       = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const hasChanges =
    items.some(i => i.isNew) ||
    items.length !== initialSortable.length ||
    items.some((i, idx) => initialSortable[idx]?.id !== i.id)

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setItems(prev => {
      const oldIndex = prev.findIndex(i => i.id === active.id)
      const newIndex = prev.findIndex(i => i.id === over.id)
      if (oldIndex < 0 || newIndex < 0) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleAddOrders(orders: Order[]) {
    setItems(prev => [
      ...prev,
      ...orders.map(o => ({
        id: o.id,
        customerName: o.customer.name,
        customerAddress: o.customer.address,
        status: o.status,
        isNew: true,
      })),
    ])
    setShowMap(false)
  }

  function removeNew(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const orderIds = [...lockedItems.map(o => o.id), ...items.map(i => i.id)]
      await api.patch(`/routes/${route.id}/orders`, { orderIds })
      onSaved()
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Erro ao salvar alterações')
      setConfirming(false)
    } finally {
      setSaving(false)
    }
  }

  // IDs already in the route (locked or sortable) — excluded from the add-map
  const excludeIds = useMemo(
    () => new Set<string>([...lockedItems.map(o => o.id), ...items.map(i => i.id)]),
    [lockedItems, items]
  )

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
          Editando ordem dos pedidos
        </h2>
        <button
          onClick={() => setShowMap(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 8%, white)' }}
        >
          <Plus className="h-4 w-4" />
          Adicionar pedido
        </button>
      </div>

      <p className="mb-4 text-xs text-gray-500">
        Arraste para reordenar. Pedidos concluídos ficam fixos no topo e novos pedidos não
        podem ser colocados antes deles.
      </p>

      {/* Locked (finished) orders — pinned, dimmed, non-draggable */}
      {lockedItems.length > 0 && (
        <div className="mb-3 space-y-3">
          {lockedItems.map((o, i) => (
            <div
              key={o.id}
              className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 opacity-50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-400 text-sm font-bold text-white">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{o.customerName}</p>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{o.customerAddress}</span>
                </div>
              </div>
              <Lock className="h-4 w-4 shrink-0 text-gray-400" />
            </div>
          ))}
        </div>
      )}

      {/* Sortable orders (existing pending + newly added) */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <SortableRow
                key={item.id}
                item={item}
                position={lockedItems.length + idx + 1}
                onRemove={item.isNew ? () => removeNew(item.id) : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {items.length === 0 && lockedItems.length === 0 && (
        <p className="py-4 text-sm text-gray-400">Nenhum pedido. Adicione pedidos à rota.</p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Action bar */}
      <div className="mt-6 flex items-center gap-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={() => setConfirming(true)} disabled={!hasChanges || saving}>
          Salvar alterações
        </Button>
      </div>

      {/* Add-orders map modal */}
      {showMap && (
        <AddOrdersMap
          excludeIds={excludeIds}
          onClose={() => setShowMap(false)}
          onAdd={handleAddOrders}
        />
      )}

      {/* Confirm modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="font-semibold text-gray-900">Confirmar alteração da rota</h2>
            <p className="mt-1 text-sm text-gray-500">
              A nova ordem dos pedidos será salva e o entregador será notificado no aplicativo.
              Deseja continuar?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                style={{ background: 'var(--color-primary)' }}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableRow({
  item,
  position,
  onRemove,
}: {
  item: EditItem
  position: number
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border p-4 ${
        item.isNew ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: item.isNew ? '#059669' : 'var(--color-primary)' }}
      >
        {position}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-gray-900">{item.customerName}</p>
          {item.isNew && (
            <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Novo
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{item.customerAddress}</span>
        </div>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          aria-label="Remover pedido adicionado"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

function AddOrdersMap({
  excludeIds,
  onClose,
  onAdd,
}: {
  excludeIds: Set<string>
  onClose: () => void
  onAdd: (orders: Order[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])

  // Fetch the active orders the same way the orders page map does (proven to work),
  // then filter client-side. Tolerate both array and paginated ({ items }) shapes.
  const { data } = useSWR<Order[] | { items: Order[] }>(
    '/orders',
    (u: string) => api.get<Order[] | { items: Order[] }>(u),
  )
  const orders: Order[] = Array.isArray(data) ? data : (data?.items ?? [])

  // All unassigned PREPARING orders not already in the route
  const available = useMemo(
    () => orders.filter(o =>
      o.status === 'PREPARING' &&
      !o.deliverer &&
      !excludeIds.has(o.id)
    ),
    [orders, excludeIds]
  )

  // Subset that can be pinned on the map (has coordinates)
  const withCoords = useMemo(
    () => available.filter(o => o.customer.lat != null && o.customer.lng != null),
    [available]
  )

  const destinations: MapDestination[] = withCoords.map(o => ({
    id:     o.id,
    lat:    o.customer.lat!,
    lng:    o.customer.lng!,
    label:  `${o.customer.name} · #${o.id.slice(-8).toUpperCase()}`,
    status: o.customer.address,
    selectable:     true,
    selected:       selected.includes(o.id),
    markerColor:    selected.includes(o.id) ? 'blue' : 'gray',
    selectionOrder: selected.includes(o.id) ? selected.indexOf(o.id) + 1 : undefined,
  }))

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function confirm() {
    const chosen = selected
      .map(id => available.find(o => o.id === id))
      .filter((o): o is Order => !!o)
    onAdd(chosen)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Adicionar pedidos à rota</h2>
            <p className="text-xs text-gray-500">
              Selecione os pedidos não atribuídos que deseja incluir — no mapa ou na lista.
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {available.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <p className="text-sm text-gray-400">
              Nenhum pedido em “Preparando” disponível para adicionar.
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Map (only orders with coordinates) */}
            {withCoords.length > 0 && (
              <div className="relative isolate h-56 shrink-0 border-b border-gray-200">
                <LiveMap
                  destinations={destinations}
                  autoFitBounds
                  height="100%"
                  onDestinationClick={(id) => toggle(id)}
                />
              </div>
            )}

            {/* Selectable list (covers orders without coordinates too) */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="space-y-2">
                {available.map(o => {
                  const isSel = selected.includes(o.id)
                  const noCoords = o.customer.lat == null || o.customer.lng == null
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggle(o.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                        isSel ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          isSel ? 'bg-blue-600 text-white' : 'border border-gray-300 text-transparent'
                        }`}
                      >
                        {isSel ? selected.indexOf(o.id) + 1 : ''}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">{o.customer.name}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{o.customer.address}</span>
                        </div>
                      </div>
                      {noCoords && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          Sem localização
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-gray-200 px-5 py-3">
          <span className="text-sm font-medium text-gray-700">
            {selected.length} selecionado(s)
          </span>
          <div className="ml-auto flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={confirm} disabled={selected.length === 0}>
              Adicionar ({selected.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
