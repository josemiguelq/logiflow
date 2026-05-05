'use client'

import { useState, FormEvent } from 'react'
import useSWR from 'swr'
import { X } from 'lucide-react'
import { Customer } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  onClose: () => void
  onCreated: () => void
}

export function NewOrderModal({ onClose, onCreated }: Props) {
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [notes, setNotes]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const { data: customers = [] } = useSWR<Customer[]>(
    search.length >= 2 ? `/customers?search=${encodeURIComponent(search)}` : null,
    (url: string) => api.get<Customer[]>(url)
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    try {
      await api.post('/orders', { customerId: selected.id, notes: notes || undefined })
      onCreated()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

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
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Cliente
            </label>
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null) }}
            />
            {customers.length > 0 && !selected && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => { setSelected(c); setSearch(c.name) }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 text-gray-500">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected && (
              <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                <p className="font-medium text-brand-700">{selected.name}</p>
                <p className="text-brand-600">{selected.address}</p>
              </div>
            )}
          </div>

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
