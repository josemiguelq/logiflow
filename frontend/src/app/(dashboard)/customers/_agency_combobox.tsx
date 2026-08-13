'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Search, X, Pencil, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Agency } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AddressAutocomplete, geocodeAddress } from './_form'

// Modal para criar/editar uma agência (nome + endereço geocodificado). As
// coordenadas são necessárias para a validação de proximidade na entrega.
function AgencyModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: { id?: string; name: string; address: string; lat?: number | null; lng?: number | null }
  onClose: () => void
  onSaved: (a: Agency) => void
}) {
  const [name, setName]       = useState(initial.name)
  const [address, setAddress] = useState(initial.address)
  const [coords, setCoords]   = useState<{ lat: number; lng: number } | null>(
    initial.lat != null && initial.lng != null ? { lat: initial.lat, lng: initial.lng } : null
  )
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSave() {
    if (!name.trim() || !address.trim()) {
      setError('Informe nome e endereço da agência')
      return
    }
    setLoading(true)
    setError('')
    try {
      let { lat, lng } = coords ?? {}
      if (lat == null || lng == null) {
        const geo = await geocodeAddress(address.trim())
        if (geo) { lat = geo.lat; lng = geo.lng }
      }
      const body = { name: name.trim(), address: address.trim(), lat: lat ?? null, lng: lng ?? null }
      const saved = initial.id
        ? await api.put<Agency>(`/agencies/${initial.id}`, body)
        : await api.post<Agency>('/agencies', body)
      onSaved(saved)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial.id ? 'Editar agência' : 'Nova agência'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome da agência</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Agência Correios Centro" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Endereço da agência</label>
            <AddressAutocomplete
              value={address}
              onChange={v => { setAddress(v); setCoords(null) }}
              onPick={r => { setAddress(r.address); setCoords({ lat: r.lat, lng: r.lng }) }}
              placeholder="Rua, número — ex: Av. Afonso Pena, 1000"
            />
            <p className="mt-1 text-xs text-gray-400">
              O endereço é geocodificado para validar a proximidade na entrega.
            </p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="button" className="flex-1" onClick={handleSave} disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Dropdown de busca de agências (typeahead), com opção de criar/editar. Modelado
// no AssistanceCombobox, mas a criação abre um modal (agência tem nome + endereço).
export function AgencyCombobox({
  value,
  onChange,
}: {
  value: Agency | null
  onChange: (sel: Agency | null) => void
}) {
  const [query, setQuery] = useState(value?.name ?? '')
  const [items, setItems] = useState<Agency[]>([])
  const [open, setOpen]   = useState(false)
  const [modal, setModal] = useState<null | { id?: string; name: string; address: string; lat?: number | null; lng?: number | null }>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref   = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value?.name ?? '') }, [value?.id, value?.name])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(value?.name ?? '')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [value?.name])

  function handleChange(v: string) {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    if (!v.trim()) { setItems([]); setOpen(true); return }
    timer.current = setTimeout(async () => {
      try {
        const { items } = await api.get<{ items: Agency[] }>(
          `/agencies?search=${encodeURIComponent(v.trim())}`,
        )
        setItems(items)
      } catch { setItems([]) }
      setOpen(true)
    }, 350)
  }

  function pick(a: Agency) {
    onChange(a)
    setQuery(a.name)
    setOpen(false)
  }

  function clear() {
    onChange(null)
    setQuery('')
    setItems([])
    setOpen(false)
  }

  const typed      = query.trim()
  const exactMatch = items.some(a => a.name.toLowerCase() === typed.toLowerCase())

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Buscar agência de entrega..."
          className="pl-9 pr-16"
          autoComplete="off"
        />
        {value && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setModal({ id: value.id, name: value.name, address: value.address, lat: value.lat, lng: value.lng })}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Editar agência"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={clear}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Remover agência"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Endereço da agência selecionada */}
      {value && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
          <Building2 className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{value.address}</span>
        </p>
      )}

      {open && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg text-sm max-h-56 overflow-y-auto">
          {items.map(a => (
            <li
              key={a.id}
              className="cursor-pointer px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              onMouseDown={() => pick(a)}
            >
              <span className="block font-medium text-gray-800">{a.name}</span>
              <span className="block truncate text-xs text-gray-500">{a.address}</span>
            </li>
          ))}
          <li
            className="cursor-pointer px-3 py-2.5 hover:bg-gray-50 border-t border-gray-100 flex items-center gap-1.5"
            style={{ color: 'var(--color-primary)' }}
            onMouseDown={(e) => { e.preventDefault(); setModal({ name: typed && !exactMatch ? typed : '', address: '' }); setOpen(false) }}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="font-medium">Nova agência</span>
          </li>
        </ul>
      )}

      {modal && (
        <AgencyModal
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={(a) => { setModal(null); pick(a) }}
        />
      )}
    </div>
  )
}
