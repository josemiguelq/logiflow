'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Store, Zap, Palette, X, Users, Trash2, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface StoreRow {
  id: string
  name: string
  createdAt: string
  customThemeEnabled: boolean
  whatsappEnabled: boolean
  deliveredCount: number
}

interface StoreUser {
  id: string
  name: string
  email: string
  username: string
  role: 'OWNER' | 'MANAGER' | 'ASSISTANT'
  createdAt: string
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

const ROLE_LABEL: Record<string, string> = {
  OWNER:     'Owner',
  MANAGER:   'Gerente',
  ASSISTANT: 'Assistente',
}

const ROLE_COLOR: Record<string, string> = {
  OWNER:     'bg-purple-100 text-purple-700',
  MANAGER:   'bg-blue-100 text-blue-700',
  ASSISTANT: 'bg-gray-100 text-gray-600',
}

export default function SuperAdminStoresPage() {
  const router  = useRouter()
  const [stores,          setStores]          = useState<StoreRow[]>([])
  const [loading,         setLoading]         = useState(true)
  const [showForm,        setShowForm]        = useState(false)
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null)
  const [createUserFor,   setCreateUserFor]   = useState<StoreRow | null>(null)

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

  function toggleExpand(storeId: string) {
    setExpandedStoreId(prev => prev === storeId ? null : storeId)
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
              <div key={s.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="flex items-start justify-between gap-4 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                      <Store className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="text-xs text-gray-400">
                          {new Date(s.createdAt).toLocaleDateString('pt-BR')} · {s.id.slice(0, 8)}
                        </p>
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          <CheckCircle className="h-3 w-3" />
                          {s.deliveredCount} entregas
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
                    <button
                      onClick={() => toggleExpand(s.id)}
                      className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Usuários
                      {expandedStoreId === s.id
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {expandedStoreId === s.id && (
                  <StoreUsersPanel
                    store={s}
                    onCreateUser={() => setCreateUserFor(s)}
                  />
                )}
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

      {createUserFor && (
        <CreateStoreUserModal
          store={createUserFor}
          onClose={() => setCreateUserFor(null)}
          onCreated={() => setCreateUserFor(null)}
        />
      )}
    </div>
  )
}

function StoreUsersPanel({ store, onCreateUser }: { store: StoreRow; onCreateUser: () => void }) {
  const [users,   setUsers]   = useState<StoreUser[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await saFetch<StoreUser[]>(`/super-admin/stores/${store.id}/users`)
      setUsers(data)
    } finally {
      setLoading(false)
    }
  }, [store.id])

  useEffect(() => { load() }, [load])

  async function handleDelete(userId: string, name: string) {
    if (!confirm(`Remover ${name}?`)) return
    await saFetch(`/super-admin/stores/${store.id}/users/${userId}`, { method: 'DELETE' })
    setUsers(prev => prev.filter(u => u.id !== userId))
  }

  return (
    <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Usuários da loja
        </span>
        <button
          onClick={onCreateUser}
          className="flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
        >
          <Plus className="h-3 w-3" /> Novo usuário
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
        </div>
      ) : users.length === 0 ? (
        <p className="py-2 text-center text-xs text-gray-400">Nenhum usuário</p>
      ) : (
        <div className="space-y-1">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                <p className="text-xs text-gray-400 truncate">{u.email} · @{u.username}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLOR[u.role]}`}>
                {ROLE_LABEL[u.role]}
              </span>
              {u.role !== 'OWNER' && (
                <button
                  onClick={() => handleDelete(u.id, u.name)}
                  className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
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

function CreateStoreUserModal({
  store, onClose, onCreated,
}: {
  store: StoreRow
  onClose: () => void
  onCreated: () => void
}) {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'OWNER' | 'MANAGER' | 'ASSISTANT'>('ASSISTANT')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await saFetch(`/super-admin/stores/${store.id}/users`, {
        method: 'POST',
        body: JSON.stringify({ name, email, username, password, role }),
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
          <div>
            <h2 className="text-lg font-semibold">Novo Usuário</h2>
            <p className="text-xs text-gray-400">{store.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required placeholder="letras, números, _ e ."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Perfil</label>
            <select value={role} onChange={e => setRole(e.target.value as typeof role)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="OWNER">Owner</option>
              <option value="MANAGER">Gerente</option>
              <option value="ASSISTANT">Assistente</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              {loading ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
