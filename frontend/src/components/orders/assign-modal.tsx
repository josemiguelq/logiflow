'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { X, Truck, Plus, ArrowLeft, Check } from 'lucide-react'
import { Order, DeliveryRoute } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  order: Order
  onClose: () => void
  onAssigned: (routeId: string) => void
}

interface Suggestion {
  id: string
  name: string
  status: string
  active_orders: number
  active_route_id: string | null
  route_pending_count: number | null
}

const DELIVERER_STATUS = {
  AVAILABLE: { label: 'Disponível', color: 'text-green-600 bg-green-50' },
  ON_ROUTE:  { label: 'Em rota',    color: 'text-orange-600 bg-orange-50' },
  OFFLINE:   { label: 'Offline',    color: 'text-gray-500 bg-gray-100' },
}

export function AssignModal({ order, onClose, onAssigned }: Props) {
  const [selected, setSelected]   = useState<Suggestion | null>(null)
  // Para entregadores com rota ativa: 'choice' (decidir) | 'add' (escolher posição)
  const [step, setStep]           = useState<'select' | 'choice' | 'add'>('select')
  const [route, setRoute]         = useState<DeliveryRoute | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  // Índice (0..N) onde o novo pedido será inserido na lista da rota.
  const [insertAt, setInsertAt]   = useState(0)
  const [loading, setLoading]     = useState(false)

  const { data: suggestions = [] } = useSWR<Suggestion[]>(
    '/deliverers/suggest',
    (url: string) => api.get<Suggestion[]>(url)
  )

  const withRoute    = suggestions.filter(d => d.active_route_id)
  const withoutRoute = suggestions.filter(d => !d.active_route_id)

  function reset() {
    setSelected(null)
    setStep('select')
    setRoute(null)
    setInsertAt(0)
  }

  function pick(d: Suggestion) {
    setSelected(d)
    if (d.active_route_id) {
      setStep('choice')
    } else {
      // Sem rota ativa: atribui direto criando nova rota.
      assignNewRoute(d.id)
    }
  }

  async function assignNewRoute(delivererId: string) {
    setLoading(true)
    try {
      const result = await api.patch<{ route: { id: string } }>(
        `/orders/${order.id}/assign`,
        { delivererId }
      )
      onAssigned(result.route.id)
    } finally {
      setLoading(false)
    }
  }

  async function openPositionPicker() {
    if (!selected?.active_route_id) return
    setRouteLoading(true)
    try {
      const r = await api.get<DeliveryRoute>(`/routes/${selected.active_route_id}`)
      setRoute(r)
      setInsertAt(r.orders.length) // por padrão, no fim da rota
      setStep('add')
    } finally {
      setRouteLoading(false)
    }
  }

  async function assignToRoute() {
    if (!selected?.active_route_id || !route) return
    setLoading(true)
    try {
      const existingIds = route.orders.map(o => o.id)
      const orderIds = [
        ...existingIds.slice(0, insertAt),
        order.id,
        ...existingIds.slice(insertAt),
      ]
      const result = await api.patch<{ route: { id: string } }>(
        `/orders/${order.id}/assign`,
        { delivererId: selected.id, routeId: selected.active_route_id, orderIds }
      )
      onAssigned(result.route.id)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step !== 'select' && (
              <button onClick={reset} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-900">Atribuir Entregador</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Pedido para <strong>{order.customer.name}</strong>
        </p>

        {/* ── Passo 1: seleção do entregador, dividido em grupos ───────────── */}
        {step === 'select' && (
          <div className="max-h-[55vh] space-y-4 overflow-y-auto">
            {suggestions.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">Nenhum entregador disponível</p>
            )}

            {withRoute.length > 0 && (
              <DelivererGroup
                title="Com rota ativa"
                deliverers={withRoute}
                disabled={loading}
                onPick={pick}
              />
            )}
            {withoutRoute.length > 0 && (
              <DelivererGroup
                title="Sem rota ativa"
                deliverers={withoutRoute}
                disabled={loading}
                onPick={pick}
              />
            )}
          </div>
        )}

        {/* ── Passo 2: rota ativa ou nova ──────────────────────────────────── */}
        {step === 'choice' && selected && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              <strong>{selected.name}</strong> já tem uma rota ativa com{' '}
              {selected.route_pending_count} pedido(s) pendente(s).
            </p>
            <button
              onClick={openPositionPicker}
              disabled={routeLoading}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3 text-left hover:border-brand-300"
            >
              <Plus className="h-5 w-5 text-brand-600" />
              <div>
                <p className="font-medium text-gray-900">
                  {routeLoading ? 'Carregando rota...' : 'Adicionar à rota ativa'}
                </p>
                <p className="text-xs text-gray-500">Escolha a ordem de entrega</p>
              </div>
            </button>
            <button
              onClick={() => assignNewRoute(selected.id)}
              disabled={loading}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3 text-left hover:border-brand-300"
            >
              <Truck className="h-5 w-5 text-gray-600" />
              <div>
                <p className="font-medium text-gray-900">
                  {loading ? 'Atribuindo...' : 'Criar nova rota'}
                </p>
                <p className="text-xs text-gray-500">Rota separada só com este pedido</p>
              </div>
            </button>
          </div>
        )}

        {/* ── Passo 3: escolher a posição na rota ──────────────────────────── */}
        {step === 'add' && route && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Onde inserir o pedido de <strong>{order.customer.name}</strong> na rota?
            </p>

            <div className="max-h-[40vh] overflow-y-auto rounded-xl border border-gray-200 p-2">
              <InsertSlot active={insertAt === 0} onClick={() => setInsertAt(0)} />
              {route.orders.map((o, i) => {
                const done = ['DELIVERED', 'CANCELLED'].includes(o.status)
                return (
                  <div key={o.id}>
                    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${done ? 'text-gray-400' : 'text-gray-700'}`}>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-xs font-medium">
                        {done ? <Check className="h-3 w-3 text-green-600" /> : i + 1}
                      </span>
                      <span className="line-clamp-1">{o.customerName}</span>
                    </div>
                    <InsertSlot active={insertAt === i + 1} onClick={() => setInsertAt(i + 1)} />
                  </div>
                )
              })}
            </div>

            <Button className="w-full" disabled={loading} onClick={assignToRoute}>
              {loading ? 'Atribuindo...' : `Inserir na posição ${insertAt + 1}`}
            </Button>
          </div>
        )}

        {step === 'select' && (
          <div className="mt-5">
            <Button variant="outline" className="w-full" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function DelivererGroup({
  title, deliverers, disabled, onPick,
}: {
  title: string
  deliverers: Suggestion[]
  disabled: boolean
  onPick: (d: Suggestion) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-2">
        {deliverers.map((d) => {
          const st = DELIVERER_STATUS[d.status as keyof typeof DELIVERER_STATUS] ?? DELIVERER_STATUS.OFFLINE
          return (
            <button
              key={d.id}
              disabled={disabled}
              onClick={() => onPick(d)}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-gray-200 px-4 py-3 text-left transition-colors hover:border-gray-300 disabled:opacity-60"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                <Truck className="h-4 w-4 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">{d.name}</p>
                <p className="text-xs text-gray-500">{d.active_orders} pedido(s) ativo(s)</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.color}`}>
                {st.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function InsertSlot({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-3 py-1 text-xs transition-colors ${
        active ? 'font-medium text-brand-600' : 'text-gray-300 hover:text-gray-500'
      }`}
    >
      <span className={`h-px flex-1 ${active ? 'bg-brand-400' : 'bg-gray-200'}`} />
      {active ? 'Inserir aqui' : <Plus className="h-3 w-3" />}
      <span className={`h-px flex-1 ${active ? 'bg-brand-400' : 'bg-gray-200'}`} />
    </button>
  )
}
