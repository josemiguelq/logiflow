'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { X, Truck } from 'lucide-react'
import { Order, Deliverer } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  order: Order
  onClose: () => void
  onAssigned: () => void
}

const DELIVERER_STATUS = {
  AVAILABLE: { label: 'Disponível', color: 'text-green-600 bg-green-50' },
  ON_ROUTE:  { label: 'Em rota',    color: 'text-orange-600 bg-orange-50' },
  OFFLINE:   { label: 'Offline',    color: 'text-gray-500 bg-gray-100' },
}

export function AssignModal({ order, onClose, onAssigned }: Props) {
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading]       = useState(false)

  const { data: suggestions = [] } = useSWR<{ id: string; name: string; status: string; active_orders: number }[]>(
    '/deliverers/suggest',
    (url: string) => api.get<{ id: string; name: string; status: string; active_orders: number }[]>(url)
  )

  async function handleAssign() {
    if (!selectedId) return
    setLoading(true)
    try {
      await api.patch(`/orders/${order.id}/assign`, { delivererId: selectedId })
      onAssigned()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Atribuir Entregador</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Pedido para <strong>{order.customer.name}</strong>
        </p>

        <div className="space-y-2">
          {suggestions.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-4">Nenhum entregador disponível</p>
          )}
          {suggestions.map((d) => {
            const st = DELIVERER_STATUS[d.status as keyof typeof DELIVERER_STATUS] ?? DELIVERER_STATUS.OFFLINE
            return (
              <button
                key={d.id}
                onClick={() => setSelectedId(d.id)}
                className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  selectedId === d.id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
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

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={!selectedId || loading} onClick={handleAssign}>
            {loading ? 'Atribuindo...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
