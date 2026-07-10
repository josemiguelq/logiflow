'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Order, OrderInconsistency } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  order: Order
  onAck: () => void
}

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Texto em português para cada tipo de inconsistência.
export function describeInconsistency(inc: OrderInconsistency): string {
  const d = inc.details ?? {}
  if (inc.type === 'DELIVERED_OFF_TARGET') {
    const meters = Number(d.distanceMeters ?? 0)
    return `Entrega registrada a ~${meters} m do endereço do cliente.`
  }
  if (inc.type === 'SHORT_PAYMENT') {
    const expected = Number(d.expected ?? 0)
    const collected = Number(d.collected ?? 0)
    const shortfall = Number(d.shortfall ?? expected - collected)
    return `Valor recebido (${BRL(collected)}) menor que o esperado (${BRL(expected)}). Faltam ${BRL(shortfall)}.`
  }
  return 'Inconsistência na entrega.'
}

export function InconsistencyModal({ order, onAck }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const inconsistencies = order.summary?.inconsistencies ?? []

  async function handleAck() {
    setLoading(true)
    setError('')
    try {
      await api.post(`/orders/${order.id}/inconsistencies/ack`, {})
      onAck()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao registrar')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Inconsistência na entrega</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Pedido de <span className="font-medium">{order.customer.name}</span>
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {inconsistencies.map((inc, i) => (
            <li
              key={i}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {describeInconsistency(inc)}
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5">
          <Button className="w-full" onClick={handleAck} disabled={loading}>
            {loading ? 'Registrando…' : 'Entendi'}
          </Button>
        </div>
      </div>
    </div>
  )
}
