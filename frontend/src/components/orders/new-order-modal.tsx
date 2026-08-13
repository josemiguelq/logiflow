'use client'

import { useState, FormEvent } from 'react'
import useSWR from 'swr'
import { X, MapPin, Check, Crown, Printer, CheckCircle, Building2 } from 'lucide-react'
import { Customer, CustomerAddress, Order, fullAddress } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { printOrderLabel, LabelFormat } from '@/lib/print-label'

interface Props {
  onClose: () => void
  onCreated: () => void
}

// Converte um Date para o formato aceito pelo <input type="datetime-local"> (hora local).
function toLocalInput(d: Date): string {
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

export function NewOrderModal({ onClose, onCreated }: Props) {
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState<Customer | null>(null)
  const [selectedAddress, setSelectedAddress] = useState<CustomerAddress | null>(null)
  const [notes,           setNotes]           = useState('')
  const [paymentMethod,   setPaymentMethod]   = useState<'prepaid' | 'cash' | 'card'>('prepaid')
  const [cashAmount,      setCashAmount]      = useState('')
  const [isPriority,      setIsPriority]      = useState(false)
  const [maxDeliveryTime, setMaxDeliveryTime] = useState('')  // valor do input datetime-local
  const [loading,         setLoading]         = useState(false)
  const [error,           setError]           = useState('')
  const [createdOrder,    setCreatedOrder]    = useState<Order | null>(null)

  const { data: customersData } = useSWR<{ items: Customer[] }>(
    search.length >= 2 ? `/customers?search=${encodeURIComponent(search)}` : null,
    (url: string) => api.get<{ items: Customer[] }>(url)
  )
  const { data: storeSettings } = useSWR<{ paymentMethodsEnabled: boolean; labelFormat: LabelFormat }>(
    '/store/settings',
    (url: string) => api.get<{ paymentMethodsEnabled: boolean; labelFormat: LabelFormat }>(url)
  )
  const paymentMethodsEnabled = storeSettings?.paymentMethodsEnabled ?? false
  const labelFormat: LabelFormat = storeSettings?.labelFormat ?? 'thermal80'
  const customers = customersData?.items ?? []

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
        customerId:    selected.id,
        notes:         notes || undefined,
        paymentMethod,
        cashAmount:    paymentMethod === 'cash' && cashAmount ? parseFloat(cashAmount) : undefined,
        isPriority,
        maxDeliveryTime: isPriority && maxDeliveryTime ? new Date(maxDeliveryTime).toISOString() : undefined,
      }
      // Pass delivery address only when it's not the default (or when there's a single address)
      if (selectedAddress) {
        body.deliveryAddress = fullAddress(selectedAddress)
        if (selectedAddress.lat)  body.deliveryLat = selectedAddress.lat
        if (selectedAddress.lng)  body.deliveryLng = selectedAddress.lng
      }
      const created = await api.post<Order>('/orders', body)
      setCreatedOrder(created)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  function handlePrintLabel() {
    if (!selected || !createdOrder) return
    printOrderLabel({
      orderCode:      createdOrder.id.slice(-8).toUpperCase(),
      createdAt:      createdOrder.createdAt,
      customerName:   selected.name,
      phone:          selected.phone,
      address:        selectedAddress ? fullAddress(selectedAddress) : createdOrder.customer.address,
      complement:     selectedAddress?.complement ?? createdOrder.customer.complement,
      assistanceName: selected.assistanceName,
    }, labelFormat)
  }

  const hasMultipleAddresses = (selected?.addresses.length ?? 0) > 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {createdOrder ? 'Pedido criado' : 'Novo Pedido'}
          </h2>
          <button onClick={createdOrder ? onCreated : onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {createdOrder ? (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Pedido criado com sucesso</p>
                <p className="mt-0.5 font-mono text-sm font-bold text-gray-900">
                  #{createdOrder.id.slice(-8).toUpperCase()}
                </p>
              </div>
            </div>
            <Button type="button" className="w-full" onClick={handlePrintLabel} data-testid="order-print-label">
              <Printer className="h-4 w-4" />
              Imprimir etiqueta
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={onCreated}>
              Concluir
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Customer search */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Cliente</label>
            <Input
              placeholder="Buscar por nome ou telefone..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); setSelectedAddress(null) }}
              data-testid="order-customer-search"
            />
            {customers.length > 0 && !selected && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                {customers.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => selectCustomer(c)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      data-testid="order-customer-option"
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

          {/* Entrega terceirizada — herdada do cliente (somente leitura). O pedido vai
              para o endereço da agência; a etiqueta usa o endereço do cliente. */}
          {selected?.agencyId && (
            <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-800">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <span>
                <span className="font-medium">Entrega via agência: {selected.agencyName}</span>
                {selected.agencyAddress && (
                  <span className="mt-0.5 block text-xs text-indigo-700/90">{selected.agencyAddress}</span>
                )}
              </span>
            </div>
          )}

          {/* Payment method — only shown when store has the feature enabled */}
          {paymentMethodsEnabled && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Forma de pagamento
              </label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'prepaid', label: 'Pré-pago' },
                  { value: 'cash',   label: 'Pagar na entrega' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setPaymentMethod(value); if (value !== 'cash') setCashAmount('') }}
                    className="rounded-lg border-2 py-2 text-sm font-medium transition-colors"
                    style={paymentMethod === value
                      ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)', background: 'color-mix(in srgb, var(--color-primary) 8%, white)' }
                      : { borderColor: '#E5E7EB', color: '#6B7280' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {paymentMethod === 'cash' && (
                <div className="mt-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Valor a cobrar (R$)"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Prioridade */}
          <div>
            <button
              type="button"
              onClick={() => {
                const next = !isPriority
                setIsPriority(next)
                // Ao ativar, sugere o horário máximo como agora + 30min (default hoje).
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
          </div>

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
            <Button type="submit" className="flex-1" disabled={!selected || loading} data-testid="order-submit">
              {loading ? 'Criando...' : 'Criar Pedido'}
            </Button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}
