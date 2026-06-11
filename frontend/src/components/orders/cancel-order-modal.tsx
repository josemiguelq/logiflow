'use client'

import { useState } from 'react'
import { X, Ban } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  order: Order
  onClose: () => void
  onCancelled: () => void
}

// Mesmos códigos do backend/app.
const REASONS = [
  { code: 'MISSING_ITEM', label: 'Pedido faltando' },
  { code: 'WRONG_ORDER',  label: 'Cliente/Pedido errado' },
  { code: 'OTHER',        label: 'Outro' },
] as const

export function CancelOrderModal({ order, onClose, onCancelled }: Props) {
  const [reasonCode, setReasonCode] = useState<string>('')
  const [note, setNote]             = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  async function handleCancel() {
    if (!reasonCode) {
      setError('Selecione o motivo do cancelamento')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.patch(`/orders/${order.id}/cancel`, {
        reasonCode,
        ...(reasonCode === 'OTHER' && note.trim() ? { note: note.trim() } : {}),
      })
      onCancelled()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao cancelar')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
              <Ban className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Cancelar pedido</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                de <span className="font-medium">{order.customer.name}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Motivo do cancelamento
        </p>
        <div className="space-y-2">
          {REASONS.map((r) => (
            <button
              key={r.code}
              onClick={() => { setReasonCode(r.code); setError('') }}
              className={`flex w-full items-center gap-2.5 rounded-xl border-2 px-4 py-2.5 text-left text-sm transition-colors ${
                reasonCode === r.code ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                reasonCode === r.code ? 'border-red-500' : 'border-gray-300'
              }`}>
                {reasonCode === r.code && <span className="h-2 w-2 rounded-full bg-red-500" />}
              </span>
              {r.label}
            </button>
          ))}
        </div>

        {reasonCode === 'OTHER' && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="Descreva o motivo (opcional)"
            className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={loading}>
            Voltar
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700"
            onClick={handleCancel}
            disabled={loading}
          >
            {loading ? 'Cancelando…' : 'Confirmar cancelamento'}
          </Button>
        </div>
      </div>
    </div>
  )
}
