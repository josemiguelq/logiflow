'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Plus, Search, MapPin, Phone, Trash2, ChevronDown, Pencil, X, Check } from 'lucide-react'
import { Customer, CustomerAddress } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// ── Address autocomplete (Nominatim / OpenStreetMap) ──────────────────────────

interface NominatimResult { display_name: string }

function AddressAutocomplete({
  value, onChange, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open,        setOpen]        = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref   = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleChange(v: string) {
    onChange(v)
    if (timer.current) clearTimeout(timer.current)
    if (v.length < 4) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=5&q=${encodeURIComponent(v)}`
        const res  = await fetch(url, { headers: { 'Accept-Language': 'pt-BR' } })
        const data = (await res.json()) as NominatimResult[]
        const results = data.map(r => r.display_name)
        setSuggestions(results)
        setOpen(results.length > 0)
      } catch { /* ignore */ }
    }, 400)
  }

  function pick(s: string) {
    // Nominatim returns full address like "Rua X, 123, Bairro, Cidade, Estado, Brasil"
    // Strip the country suffix for cleaner storage
    const clean = s.replace(/, Brasil$/, '').replace(/, Brazil$/, '')
    onChange(clean)
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg text-sm max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className="cursor-pointer px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0 leading-snug"
              onMouseDown={() => pick(s)}
            >
              <MapPin className="mr-1.5 inline h-3 w-3 shrink-0 text-gray-400" />
              {s.replace(/, Brasil$/, '').replace(/, Brazil$/, '')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const ADDRESS_LABELS = ['Principal', 'Casa', 'Trabalho', 'Outro']

const fetcher = (url: string) => api.get<Customer[]>(url)

export default function CustomersPage() {
  const [search,          setSearch]          = useState('')
  const [showCreate,      setShowCreate]      = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const url = `/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`
  const { data: customers = [], mutate } = useSWR(url, fetcher)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">{customers.length} cliente(s)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {customers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <p className="font-medium">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Telefone</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Endereços</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => {
                const primary = c.addresses.find(a => a.isDefault) ?? c.addresses[0]
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        {c.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="max-w-xs truncate">{primary?.address ?? c.address}</span>
                        {c.addresses.length > 1 && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            +{c.addresses.length - 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                        Editar
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CustomerCreateModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); mutate() }}
        />
      )}

      {editingCustomer && (
        <CustomerEditModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSaved={() => { setEditingCustomer(null); mutate() }}
        />
      )}
    </div>
  )
}

// ── Shared helpers ────────────────────────────────────────────────────────────

interface AddressEntry {
  id?: string
  label: string
  address: string
  complement: string
  isDefault: boolean
}

function emptyAddress(label = 'Casa'): AddressEntry {
  return { label, address: '', complement: '', isDefault: false }
}

function AddressLabelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 appearance-none rounded-lg border border-gray-200 bg-white pl-2.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1"
        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
      >
        {ADDRESS_LABELS.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
    </div>
  )
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CustomerCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [addresses, setAddresses] = useState<AddressEntry[]>([{ ...emptyAddress('Principal'), isDefault: true }])

  function updateField(i: number, field: keyof AddressEntry, value: string) {
    setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, [field]: value } : a))
  }

  function addRow() {
    setAddresses(prev => [...prev, emptyAddress()])
  }

  function removeRow(i: number) {
    setAddresses(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const filled = addresses.filter(a => a.address.trim())
    if (!filled.length) { setError('Informe pelo menos um endereço'); return }
    setLoading(true)
    try {
      await api.post('/customers', {
        name, phone,
        addresses: filled.map((a, i) => ({
          label:      a.label,
          address:    a.address.trim(),
          complement: a.complement.trim() || undefined,
          isDefault:  i === 0,
        })),
      })
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Novo Cliente" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <Field label="Nome">
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Nome completo" />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="(67) 99999-9999" />
          </Field>

          <AddressList
            addresses={addresses}
            onUpdate={updateField}
            onAdd={addRow}
            onRemove={removeRow}
            isCreate
          />

          {error && <ErrorMsg>{error}</ErrorMsg>}
        </div>
        <ModalFooter onClose={onClose} loading={loading} label="Salvar" />
      </form>
    </Modal>
  )
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditAddressEntry extends AddressEntry {
  isEditing: boolean
  isRemoved: boolean
  _orig: { label: string; address: string; complement: string }
}

function toEditEntry(a: CustomerAddress): EditAddressEntry {
  return {
    id:         a.id,
    label:      a.label,
    address:    a.address,
    complement: a.complement ?? '',
    isDefault:  a.isDefault,
    isEditing:  false,
    isRemoved:  false,
    _orig: { label: a.label, address: a.address, complement: a.complement ?? '' },
  }
}

function CustomerEditModal({
  customer, onClose, onSaved,
}: {
  customer: Customer
  onClose: () => void
  onSaved: () => void
}) {
  const [name,      setName]      = useState(customer.name)
  const [phone,     setPhone]     = useState(customer.phone)
  const [addresses, setAddresses] = useState<EditAddressEntry[]>(
    customer.addresses.map(toEditEntry)
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const visible = addresses.filter(a => !a.isRemoved)

  function setAddr(i: number, patch: Partial<EditAddressEntry>) {
    setAddresses(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a))
  }

  function startEdit(i: number) {
    setAddr(i, { isEditing: true })
  }

  function cancelEdit(i: number) {
    const orig = addresses[i]!._orig
    setAddr(i, { ...orig, isEditing: false })
  }

  function confirmEdit(i: number) {
    const a = addresses[i]!
    setAddr(i, {
      isEditing: false,
      _orig: { label: a.label, address: a.address, complement: a.complement },
    })
  }

  function removeEntry(i: number) {
    if (visible.length <= 1) return
    setAddr(i, { isRemoved: true, isEditing: false })
  }

  function addEntry() {
    const entry: EditAddressEntry = {
      ...emptyAddress(),
      isEditing: true,
      isRemoved: false,
      _orig: { label: 'Casa', address: '', complement: '' },
    }
    setAddresses(prev => [...prev, entry])
  }

  async function handleSave() {
    const active = addresses.filter(a => !a.isRemoved && a.address.trim())
    if (!active.length) { setError('Informe pelo menos um endereço'); return }
    setLoading(true)
    try {
      await api.put(`/customers/${customer.id}`, {
        name,
        phone,
        addresses: active.map((a, i) => ({
          id:         a.id,
          label:      a.label,
          address:    a.address.trim(),
          complement: a.complement.trim() || undefined,
          isDefault:  i === 0,
        })),
      })
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Editar Cliente" onClose={onClose}>
      <div className="flex flex-col">
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Basic info */}
          <Field label="Nome">
            <Input value={name} onChange={e => setName(e.target.value)} required />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={e => setPhone(e.target.value)} required />
          </Field>

          {/* Address list */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Endereços</span>
              <button
                type="button"
                onClick={addEntry}
                className="flex items-center gap-1 text-xs font-medium hover:opacity-80"
                style={{ color: 'var(--color-primary)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar
              </button>
            </div>

            <div className="space-y-2">
              {addresses.map((addr, i) => {
                if (addr.isRemoved) return null
                const isFirst = visible.indexOf(addr) === 0

                return addr.isEditing ? (
                  // ── Edit mode ──
                  <div key={i} className="rounded-xl border-2 border-dashed p-3 space-y-2" style={{ borderColor: 'var(--color-primary)' }}>
                    <div className="flex items-center justify-between">
                      <AddressLabelSelect
                        value={addr.label}
                        onChange={v => setAddr(i, { label: v })}
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => confirmEdit(i)}
                          disabled={!addr.address.trim()}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-40 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => addr.id ? cancelEdit(i) : setAddr(i, { isRemoved: true })}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <AddressAutocomplete
                      value={addr.address}
                      onChange={v => setAddr(i, { address: v })}
                      placeholder="Rua, número, bairro"
                    />
                    <Input
                      value={addr.complement}
                      onChange={e => setAddr(i, { complement: e.target.value })}
                      placeholder="Complemento (opcional)"
                    />
                  </div>
                ) : (
                  // ── View mode ──
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {addr.label}
                        </span>
                        {isFirst && (
                          <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                            Principal
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 leading-snug">{addr.address}</p>
                      {addr.complement && (
                        <p className="text-xs text-gray-500">{addr.complement}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(i)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-600 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {visible.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEntry(i)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {error && <ErrorMsg>{error}</ErrorMsg>}
        </div>

        <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={loading} onClick={handleSave}>
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{children}</p>
  )
}

function ModalFooter({ onClose, loading, label }: { onClose: () => void; loading: boolean; label: string }) {
  return (
    <div className="border-t border-gray-100 px-6 py-4 flex gap-3">
      <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" className="flex-1" disabled={loading}>
        {loading ? 'Salvando...' : label}
      </Button>
    </div>
  )
}

// ── AddressList (used in create modal) ───────────────────────────────────────

function AddressList({
  addresses, onUpdate, onAdd, onRemove, isCreate,
}: {
  addresses: AddressEntry[]
  onUpdate: (i: number, field: keyof AddressEntry, value: string) => void
  onAdd: () => void
  onRemove: (i: number) => void
  isCreate?: boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Endereços</span>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1 text-xs font-medium hover:opacity-80"
          style={{ color: 'var(--color-primary)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar endereço
        </button>
      </div>

      <div className="space-y-3">
        {addresses.map((addr, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <AddressLabelSelect
                value={addr.label}
                onChange={v => onUpdate(i, 'label', v)}
              />
              {i === 0 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Principal
                </span>
              )}
              {addresses.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <AddressAutocomplete
              value={addr.address}
              onChange={v => onUpdate(i, 'address', v)}
              placeholder="Rua, número, bairro"
              className="mb-2 bg-white"
            />
            <Input
              value={addr.complement}
              onChange={e => onUpdate(i, 'complement', e.target.value)}
              placeholder="Complemento (opcional)"
              className="bg-white"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
