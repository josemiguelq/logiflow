'use client'

import { useState } from 'react'
import { Crown } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/input'

// Converte um Date para o formato do <input type="datetime-local"> (hora local).
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

/**
 * Editor inline de prioridade na tela de detalhe do pedido: marca/desmarca e ajusta
 * o horário máximo de entrega, persistindo via PATCH /orders/:id/priority.
 */
export function PriorityEditor({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [isPriority, setIsPriority] = useState(!!order.isPriority)
  const [maxDeliveryTime, setMaxDeliveryTime] = useState(
    order.maxDeliveryTime ? toLocalInput(new Date(order.maxDeliveryTime)) : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      await api.patch(`/orders/${order.id}/priority`, {
        isPriority,
        maxDeliveryTime: isPriority && maxDeliveryTime ? new Date(maxDeliveryTime).toISOString() : null,
      })
      onChanged()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const dirty =
    isPriority !== !!order.isPriority ||
    (isPriority &&
      maxDeliveryTime !== (order.maxDeliveryTime ? toLocalInput(new Date(order.maxDeliveryTime)) : ''))

  return (
    <section className="border-t border-gray-100 pt-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Prioridade
      </h2>

      <button
        type="button"
        onClick={() => {
          const next = !isPriority
          setIsPriority(next)
          if (next && !maxDeliveryTime) setMaxDeliveryTime(toLocalInput(new Date(Date.now() + 30 * 60000)))
        }}
        className="flex w-full items-center justify-between rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors"
        style={isPriority
          ? { borderColor: '#F59E0B', color: '#B45309', background: '#FFFBEB' }
          : { borderColor: '#E5E7EB', color: '#6B7280' }}
      >
        <span className="flex items-center gap-2">
          <Crown className="h-4 w-4" fill={isPriority ? 'currentColor' : 'none'} />
          Pedido prioritário
        </span>
        <span
          className="flex h-5 w-9 items-center rounded-full px-0.5 transition-colors"
          style={{ background: isPriority ? '#F59E0B' : '#D1D5DB' }}
        >
          <span
            className="h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: isPriority ? 'translateX(16px)' : 'translateX(0)' }}
          />
        </span>
      </button>

      {isPriority && (
        <div className="mt-2 space-y-2">
          <label className="block text-xs font-medium text-gray-600">
            Horário máximo de entrega (opcional)
          </label>
          <Input
            type="datetime-local"
            value={maxDeliveryTime}
            onChange={(e) => setMaxDeliveryTime(e.target.value)}
          />
          <div className="flex gap-2">
            {([['+20 min', 20], ['+30 min', 30]] as const).map(([label, min]) => (
              <button
                key={min}
                type="button"
                onClick={() => setMaxDeliveryTime(toLocalInput(new Date(Date.now() + min * 60000)))}
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {saving ? 'Salvando...' : 'Salvar prioridade'}
        </button>
      )}
    </section>
  )
}
