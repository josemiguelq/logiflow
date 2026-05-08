'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Store, Zap, Palette, Trash2, X } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface StoreRow {
  id: string
  name: string
  createdAt: string
  customThemeEnabled: boolean
  whatsappEnabled: boolean
}

function saFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(SA_TOKEN_KEY)
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(async r => {
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Erro') }
    return r.json()
  })
}

export default function SuperAdminStoresPage() {
  const router  = useRouter()
  const [stores,   setStores]   = useState<StoreRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await saFetch<StoreRow[]>('/super-admin/stores')
      setStores(data)
    } catch {
      router.replace('/super-admin')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!localStorage.getItem(SA_TOKEN_KEY)) { router.replace('/super-admin'); return }
    load()
  }, [load, router])

  async function toggleFeature(storeId: string, feature: 'customThemeEnabled' | 'whatsappEnabled', val: boolean) {
    await saFetch(`/super-admin/stores/${storeId}/features`, {
      method: 'PATCH',
      body: JSON.stringify({ [feature]: val }),
    })
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, [feature]: val } : s))
  }

  function logout() {
    localStorage.removeItem(SA_TOKEN_KEY)
    router.replace('/super-admin')
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="flex h-14 items-center justify-between bg-gray-900 px-6">
        <span className="font-bold text-white">LogiFlow · Super Admin</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            <Plus className="h-4 w-4" /> Nova Loja
          </button>
          <button onClick={logout} className="text-sm text-gray-400 hover:text-white">Sair</button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Lojas ({stores.length})</h2>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
          </div>
        ) : (
          <div className="space-y-3">
            {stores.map(s => (
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                      <Store className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(s.createdAt).toLocaleDateString('pt-BR')} · {s.id.slice(0, 8)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FeatureToggle
                      label="WhatsApp"
                      icon={<Zap className="h-3.5 w-3.5" />}
                      enabled={s.whatsappEnabled}
                      onChange={v => toggleFeature(s.id, 'whatsappEnabled', v)}
                    />
                    <FeatureToggle
                      label="Tema"
                      icon={<Palette className="h-3.5 w-3.5" />}
                      enabled={s.customThemeEnabled}
                      onChange={v => toggleFeature(s.id, 'customThemeEnabled', v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <CreateStoreModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}

function FeatureToggle({
  label, icon, enabled, onChange,
}: {
  label: string
  icon: React.ReactNode
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        enabled
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      {icon}
      {label}
      <span className={`ml-0.5 ${enabled ? 'text-green-600' : 'text-gray-400'}`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  )
}

function CreateStoreModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [storeName,     setStoreName]     = useState('')
  const [ownerName,     setOwnerName]     = useState('')
  const [ownerEmail,    setOwnerEmail]    = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await saFetch('/super-admin/stores', {
        method: 'POST',
        body: JSON.stringify({ storeName, ownerName, ownerEmail, ownerPassword }),
      })
      onCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova Loja</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome da loja</label>
            <input value={storeName} onChange={e => setStoreName(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <hr className="border-gray-100" />
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Usuário owner</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input value={ownerName} onChange={e => setOwnerName(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} required minLength={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {loading ? 'Criando...' : 'Criar Loja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
