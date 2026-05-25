'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Plus, MapPin, Trash2, ChevronDown } from 'lucide-react'
import { Customer, CustomerAddress } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { maskPhone, stripPhone, formatPhone } from '@/lib/phone'

const AddressMapPicker = dynamic(() => import('./_address_map'), { ssr: false })

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

// ── Google Maps utilities ─────────────────────────────────────────────────────

interface PlaceSuggestion {
  placeId: string
  place: string
  text: { text: string }
  structuredFormat: {
    mainText: { text: string }
    secondaryText: { text: string }
  }
}

interface GeoResult { address: string; lat: number; lng: number }

async function fetchPlaceSuggestions(input: string): Promise<PlaceSuggestion[]> {
  if (!GMAPS_KEY || input.length < 3) return []
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GMAPS_KEY },
      body: JSON.stringify({ input, languageCode: 'pt-BR', regionCode: 'BR', includedPrimaryTypes: ['route', 'street_address'] }),
    })
    const data = await res.json()
    return ((data.suggestions ?? []) as { placePrediction: PlaceSuggestion }[]).map(s => s.placePrediction)
  } catch { return [] }
}

async function getPlaceCoords(placeName: string): Promise<{ lat: number; lng: number } | null> {
  if (!GMAPS_KEY) return null
  try {
    const res = await fetch(`https://places.googleapis.com/v1/${placeName}`, {
      headers: { 'X-Goog-Api-Key': GMAPS_KEY, 'X-Goog-FieldMask': 'location' },
    })
    const data = await res.json()
    if (!data.location) return null
    return { lat: data.location.latitude, lng: data.location.longitude }
  } catch { return null }
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (address.length < 4 || !GMAPS_KEY) return null
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br&language=pt-BR&key=${GMAPS_KEY}`)
    const data = await res.json()
    if (data.status !== 'OK' || !data.results[0]) return null
    const loc = data.results[0].geometry.location as { lat: number; lng: number }
    return { lat: loc.lat, lng: loc.lng }
  } catch { return null }
}

// ── AddressEntry ──────────────────────────────────────────────────────────────

export interface AddressEntry {
  id?: string
  label: string
  address: string
  complement: string
  isDefault: boolean
  lat?: number
  lng?: number
}

export function emptyAddress(label = 'Casa'): AddressEntry {
  return { label, address: '', complement: '', isDefault: false }
}

const ADDRESS_LABELS = ['Principal', 'Casa', 'Trabalho', 'Outro']

// ── AddressLabelSelect ────────────────────────────────────────────────────────

export function AddressLabelSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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

// ── AddressAutocomplete ───────────────────────────────────────────────────────

export function AddressAutocomplete({
  value, onChange, onPick, placeholder, className,
}: {
  value: string
  onChange: (v: string) => void
  onPick?: (result: GeoResult) => void
  placeholder?: string
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref = useRef<HTMLDivElement>(null)

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
    if (v.length < 3) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const results = await fetchPlaceSuggestions(v)
      setSuggestions(results)
      setOpen(results.length > 0)
    }, 350)
  }

  async function pick(s: PlaceSuggestion) {
    const street = s.structuredFormat.mainText.text
    onChange(street)
    setSuggestions([])
    setOpen(false)
    // Use full address text (with city/state) for accurate geocoding; fall back to Place Details
    const coords = await geocodeAddress(s.text.text) ?? await getPlaceCoords(s.place)
    onPick?.({ address: street, lat: coords?.lat ?? 0, lng: coords?.lng ?? 0 })
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
              className="cursor-pointer px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0 leading-snug"
              onMouseDown={() => pick(s)}
            >
              <MapPin className="mr-1.5 inline h-3 w-3 shrink-0 text-gray-400" />
              <span className="font-medium text-gray-800">{s.structuredFormat.mainText.text}</span>
              <span className="ml-1.5 text-gray-400 text-xs">{s.structuredFormat.secondaryText.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── CustomerForm ──────────────────────────────────────────────────────────────

interface Props {
  initialName?: string
  initialPhone?: string
  initialAddresses?: AddressEntry[]
  onSave: (name: string, phone: string, addresses: AddressEntry[]) => Promise<void>
  loading: boolean
  error: string
  onCancel: () => void
}

export function CustomerForm({
  initialName = '',
  initialPhone = '',
  initialAddresses,
  onSave,
  loading,
  error,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [addresses, setAddresses] = useState<AddressEntry[]>(
    initialAddresses ?? [{ ...emptyAddress('Principal'), isDefault: true }]
  )

  function updateField(i: number, field: keyof AddressEntry, value: string | boolean | number | undefined) {
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
    await onSave(name, phone, addresses)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic info */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Informações pessoais</h2>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome</label>
          <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Nome completo" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Telefone</label>
          <Input
            value={phone}
            onChange={e => setPhone(maskPhone(e.target.value))}
            required
            placeholder="(67) 99999-9999"
            inputMode="numeric"
          />
        </div>
      </div>

      {/* Addresses */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Endereços</h2>
          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-xs font-medium hover:opacity-80"
            style={{ color: 'var(--color-primary)' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar endereço
          </button>
        </div>

        <div className="space-y-4">
          {addresses.map((addr, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AddressLabelSelect value={addr.label} onChange={v => updateField(i, 'label', v)} />
                {i === 0 && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    Principal
                  </span>
                )}
                {addresses.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <AddressAutocomplete
                value={addr.address}
                onChange={v => { updateField(i, 'address', v); updateField(i, 'lat', undefined); updateField(i, 'lng', undefined) }}
                onPick={r => { updateField(i, 'address', r.address); updateField(i, 'lat', r.lat); updateField(i, 'lng', r.lng) }}
                placeholder="Rua, número — ex: Rua das Flores, 123"
                className="bg-white"
              />

              <Input
                value={addr.complement}
                onChange={e => updateField(i, 'complement', e.target.value)}
                placeholder="Complemento (opcional)"
                className="bg-white"
              />

              {addr.lat && addr.lng && (
                <div>
                  <div className="overflow-hidden rounded-xl border border-gray-200" style={{ height: 220 }}>
                    <AddressMapPicker
                      lat={addr.lat}
                      lng={addr.lng}
                      onChange={(lat, lng) => { updateField(i, 'lat', lat); updateField(i, 'lng', lng) }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-400">Arraste o pino ou clique para ajustar a posição exata</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

// ── toAddressEntries (from CustomerAddress[]) ─────────────────────────────────

export function toAddressEntries(addresses: CustomerAddress[]): AddressEntry[] {
  return addresses.map(a => ({
    id:         a.id,
    label:      a.label,
    address:    a.number ? `${a.address}, ${a.number}` : a.address,
    complement: a.complement ?? '',
    isDefault:  a.isDefault,
    lat:        a.lat,
    lng:        a.lng,
  }))
}
