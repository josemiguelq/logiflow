'use client'

import { useState, FormEvent } from 'react'
import useSWR from 'swr'
import { X, MapPin, Check } from 'lucide-react'
import { Customer, CustomerAddress, fullAddress } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function NewOrderModal({ onClose, onCreated }: Props) {
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState<Customer | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null)
  const [notes,           setNotes]           = useState('')
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')

  const { data: customers = [] } = useSWR<Customer[]>(
    search.length >= 2 ? `/customers?search=${encodeURIComponent(search)}` : null,
    (url: string) => api.get<Customer[]>(url)
  )

  function selectCustomer(c: Customer) {
    setSelected(c)
    setSearch(c.name)
    // Pre-select default address
    const def = c.addresses.find(a => a.isDefault) ?? c.addresses[0] ?? null
    setSelectedAddress(def)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    try {
      const body: Record<string, unknown> = {
        customerId: selected.id,
        notes: notes || undefined,
      }
      // Pass delivery address only when it's not the default (or when there's a single address)
      if (selectedAddress) {
        body.deliveryAddress = fullAddress(selectedAddress)
        if (selectedAddress.lat)  body.deliveryLat = selectedAddress.lat
        if (selectedAddress.lng)  body.deliveryLng = selectedAddress.lng
      }
      await api.post('/orders', body)
      onCreated()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const hasMultipleAddresses = (selected?.addresses.length ?? 0) > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Novo Pedido</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer search */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); setSelectedAddress(null) }}
            />
            {customers.length > 0 && !selected && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-gray-500">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Address picker — shown after customer is selected */}
          {selected && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Endereço de entrega
              </label>

              {hasMultipleAddresses ? (
                <div className="space-y-2">
                  {selected.addresses.map((addr) => {
                    const isChosen = selectedAddress?.id === addr.id
                    return (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => setSelectedAddress(addr)}
                        className="w-full flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
                        style={isChosen
                          ? { borderColor: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 6%, white)' }
                          : { borderColor: '#E5E7EB' }
                        }
                      >
                        {/* Radio indicator */}
                        <div
                          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                          style={isChosen
                            ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary)' }
                            : { borderColor: '#D1D5DB' }
                          }
                        >
                          {isChosen && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
                            {addr.label}
                          </p>
                          <p className="text-sm text-gray-800 leading-snug">
                            {addr.address}{addr.number ? `, ${addr.number}` : ''}
                          </p>
                          {addr.complement && (
                            <p className="text-xs text-gray-500">{addr.complement}</p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-800">
                      {selectedAddress ? fullAddress(selectedAddress) : ''}
                    </p>
                    {selectedAddress?.complement && (
                      <p className="text-xs text-gray-500">{selectedAddress.complement}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Observações (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Instruções de entrega, referências..."
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={!selected || loading}>
              {loading ? 'Criando...' : 'Criar Pedido'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
