'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { X, MapPin, AlertTriangle, Loader2, Check } from 'lucide-react'
import { Customer, Order, fullAddress } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  orderId:         string
  customerId?:     string
  currentAddress?: string
  onClose:         () => void
  onChanged:       () => void
}

export function AdjustAddressModal({ orderId, customerId, currentAddress, onClose, onChanged }: Props) {
  // When customerId isn't provided (e.g. from the route page), derive it from the order.
  const { data: order } = useSWR<Order>(
    customerId ? null : `/orders/${orderId}`,
    (u: string) => api.get<Order>(u)
  )
  const effectiveCustomerId = customerId ?? order?.customer.id

  const { data: customer } = useSWR<Customer>(
    effectiveCustomerId ? `/customers/${effectiveCustomerId}` : null,
    (u: string) => api.get<Customer>(u)
  )
  const [selected, setSelected] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const addresses = customer?.addresses ?? []
  const loading   = (!customerId && !order) || (!!effectiveCustomerId && !customer)

  async function save() {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/orders/${orderId}/delivery-address`, { addressId: selected })
      onChanged()
    } catch (e) {
      setError((e as { message?: string }).message ?? 'Erro ao alterar o endereço')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-red-600" />
            <h2 className="text-base font-semibold text-gray-900">Ajustar endereço de entrega</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Isso altera para onde o pedido será entregue. O entregador e o cliente serão
              notificados da mudança.
            </span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : addresses.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Este cliente não tem endereços cadastrados.
            </p>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => {
                const full      = fullAddress(addr)
                const isCurrent = currentAddress != null && full === currentAddress
                const isSel     = selected === addr.id
                return (
                  <button
                    key={addr.id}
                    onClick={() => setSelected(addr.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border-2 px-3 py-3 text-left transition-colors ${
                      isSel ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        isSel ? 'border-red-600 bg-red-600' : 'border-gray-300'
                      }`}
                    >
                      {isSel && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900">{addr.label}</p>
                        {isCurrent && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            Atual
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{full}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <button
            onClick={save}
            disabled={!selected || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando…' : 'Confirmar alteração'}
          </button>
        </div>
      </div>
    </div>
  )
}
