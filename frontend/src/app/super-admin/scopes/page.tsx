'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Save, RotateCcw } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

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

// ── Types ──────────────────────────────────────────────────────────────────────

interface ScopeGroup { label: string; scopes: string[] }

interface ScopeMeta {
  scopes:   string[]
  labels:   Record<string, string>
  groups:   ScopeGroup[]
  defaults: Record<string, string[]>
}

interface StoreRow {
  id: string
  name: string
}

const ROLES = ['OWNER', 'MANAGER', 'ASSISTANT'] as const
type Role   = typeof ROLES[number]

const ROLE_LABELS: Record<Role, string> = {
  OWNER:     'Owner',
  MANAGER:   'Gerente',
  ASSISTANT: 'Assistente',
}

const ROLE_COLOR: Record<Role, string> = {
  OWNER:     'bg-purple-100 text-purple-700 border-purple-200',
  MANAGER:   'bg-blue-100 text-blue-700 border-blue-200',
  ASSISTANT: 'bg-gray-100 text-gray-600 border-gray-200',
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SuperAdminScopesPage() {
  const router = useRouter()

  const [meta,          setMeta]          = useState<ScopeMeta | null>(null)
  const [stores,        setStores]        = useState<StoreRow[]>([])
  const [selectedStore, setSelectedStore] = useState<StoreRow | null>(null)
  const [roleScopes,    setRoleScopes]    = useState<Record<Role, string[]> | null>(null)
  const [saving,        setSaving]        = useState<Role | null>(null)
  const [saved,         setSaved]         = useState<Role | null>(null)
  const [loadingStore,  setLoadingStore]  = useState(false)

  useEffect(() => {
    if (!localStorage.getItem(SA_TOKEN_KEY)) { router.replace('/super-admin'); return }
    Promise.all([
      saFetch<ScopeMeta>('/super-admin/scopes'),
      saFetch<StoreRow[]>('/super-admin/stores'),
    ]).then(([m, s]) => {
      setMeta(m)
      setStores(s)
    }).catch(() => router.replace('/super-admin'))
  }, [router])

  const loadStore = useCallback(async (store: StoreRow) => {
    setLoadingStore(true)
    setSelectedStore(store)
    try {
      const data = await saFetch<Record<Role, string[]>>(
        `/super-admin/stores/${store.id}/role-scopes`
      )
      setRoleScopes(data)
    } finally {
      setLoadingStore(false)
    }
  }, [])

  function toggleScope(role: Role, scope: string) {
    if (!roleScopes) return
    const current = roleScopes[role]
    const next = current.includes(scope)
      ? current.filter(s => s !== scope)
      : [...current, scope]
    setRoleScopes({ ...roleScopes, [role]: next })
  }

  async function saveRole(role: Role) {
    if (!selectedStore || !roleScopes) return
    setSaving(role)
    try {
      await saFetch(`/super-admin/stores/${selectedStore.id}/role-scopes/${role}`, {
        method: 'PUT',
        body:   JSON.stringify({ scopes: roleScopes[role] }),
      })
      setSaved(role)
      setTimeout(() => setSaved(null), 2000)
    } finally {
      setSaving(null)
    }
  }

  function resetRole(role: Role) {
    if (!meta || !roleScopes) return
    setRoleScopes({ ...roleScopes, [role]: meta.defaults[role] ?? [] })
  }

  if (!meta) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Selecione a loja</h2>
          <p className="text-sm text-gray-500">Escolha uma loja para visualizar e editar os scopes por role.</p>
        </div>

        {/* Store picker */}
        <div className="mb-8 flex flex-wrap gap-2">
          {stores.map(s => (
            <button
              key={s.id}
              onClick={() => loadStore(s)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                selectedStore?.id === s.id
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Role scope editor */}
        {selectedStore && (
          loadingStore ? (
            <div className="flex justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
            </div>
          ) : roleScopes ? (
            <div className="space-y-6">
              {ROLES.map(role => (
                <div key={role} className={`overflow-hidden rounded-2xl border bg-white shadow-sm`}>
                  {/* Role header */}
                  <div className={`flex items-center justify-between border-b px-5 py-3 ${ROLE_COLOR[role].replace('text-', 'bg-').replace('bg-', 'bg-').split(' ')[0]}`}>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${ROLE_COLOR[role]}`}>
                        {ROLE_LABELS[role]}
                      </span>
                      <span className="text-sm text-gray-500">
                        {roleScopes[role].length} scopes ativos
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => resetRole(role)}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Padrão
                      </button>
                      <button
                        onClick={() => saveRole(role)}
                        disabled={saving === role}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          saved === role
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50'
                        }`}
                      >
                        <Save className="h-3 w-3" />
                        {saving === role ? 'Salvando…' : saved === role ? 'Salvo!' : 'Salvar'}
                      </button>
                    </div>
                  </div>

                  {/* Scope groups */}
                  <div className="divide-y divide-gray-50 px-5 py-4">
                    {meta.groups.map(group => (
                      <div key={group.label} className="py-3 first:pt-0 last:pb-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {group.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.scopes.map(scope => {
                            const active = roleScopes[role].includes(scope)
                            return (
                              <button
                                key={scope}
                                onClick={() => toggleScope(role, scope)}
                                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                                  active
                                    ? 'border-transparent bg-gray-900 text-white'
                                    : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                {meta.labels[scope] ?? scope}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null
        )}

        {!selectedStore && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-400">
            Selecione uma loja acima para gerenciar os scopes
          </div>
        )}
    </div>
  )
}
