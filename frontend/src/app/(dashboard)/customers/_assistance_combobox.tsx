'use client'

import { useState, useRef, useEffect } from 'react'
import { Plus, Search, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Assistance } from '@/types'
import { Input } from '@/components/ui/input'

// Dropdown com busca-enquanto-digita de assistências. Se o operador digita um
// nome inexistente, oferece criar a assistência na hora. Modelado no
// AddressAutocomplete (_form.tsx): debounce 350ms, dropdown inline, fecha ao
// clicar fora, seleção via onMouseDown (evita o blur do input).
export function AssistanceCombobox({
  value,
  onChange,
}: {
  value: Assistance | null
  onChange: (sel: Assistance | null) => void
}) {
  const [query, setQuery]   = useState(value?.name ?? '')
  const [items, setItems]   = useState<Assistance[]>([])
  const [open, setOpen]     = useState(false)
  const [creating, setCreating] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ref   = useRef<HTMLDivElement>(null)

  // Mantém o texto em sincronia quando o valor selecionado muda de fora.
  useEffect(() => { setQuery(value?.name ?? '') }, [value?.id, value?.name])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        // Input sempre reflete a seleção real (descarta texto não confirmado).
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
        const { items } = await api.get<{ items: Assistance[] }>(
          `/assistances?search=${encodeURIComponent(v.trim())}`,
        )
        setItems(items)
      } catch { setItems([]) }
      setOpen(true)
    }, 350)
  }

  function pick(a: Assistance) {
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

  async function createNew() {
    const name = query.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const created = await api.post<Assistance>('/assistances', { name })
      pick(created)
    } catch { /* mantém o dropdown aberto para nova tentativa */ }
    finally { setCreating(false) }
  }

  const typed       = query.trim()
  const exactMatch  = items.some(a => a.name.toLowerCase() === typed.toLowerCase())
  const showCreate  = typed.length > 0 && !exactMatch

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Buscar assistência..."
          className="pl-9 pr-8"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Remover assistência"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (items.length > 0 || showCreate) && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg text-sm max-h-52 overflow-y-auto">
          {items.map(a => (
            <li
              key={a.id}
              className="cursor-pointer px-3 py-2.5 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              onMouseDown={() => pick(a)}
            >
              <span className="font-medium text-gray-800">{a.name}</span>
            </li>
          ))}
          {showCreate && (
            <li
              className="cursor-pointer px-3 py-2.5 hover:bg-gray-50 border-t border-gray-100 flex items-center gap-1.5"
              style={{ color: 'var(--color-primary)' }}
              onMouseDown={createNew}
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              <span className="font-medium">
                {creating ? 'Adicionando...' : `Adicionar "${typed}"`}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
