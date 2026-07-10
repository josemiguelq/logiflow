'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Tag, X, Trash2, Pencil, Users, Package, Check } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface Feature {
  id:   string
  name: string
  description?: string
}

interface Plan {
  id:                string
  name:              string
  priceCents:        number
  maxDeliverers:     number | null
  maxOrdersPerMonth: number | null
  sortOrder:         number
  isActive:          boolean
  features:          { id: string; name: string }[]
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

const FEATURE_LABEL: Record<string, string> = {
  whatsapp:         'WhatsApp',
  custom_theme:     'Tema',
  csv_export:       'CSV',
  customer_ratings: 'Avaliações',
  chat:             'Chat',
}

const fmtPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtLimit = (v: number | null) => (v == null ? 'Ilimitado' : String(v))

export default function SuperAdminPlansPage() {
  const router = useRouter()
  const [plans,    setPlans]    = useState<Plan[]>([])
  const [features, setFeatures] = useState<Feature[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [planData, featureData] = await Promise.all([
        saFetch<Plan[]>('/super-admin/plans'),
        saFetch<Feature[]>('/super-admin/features'),
      ])
      setPlans(planData)
      setFeatures(featureData)
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

  async function handleDelete(plan: Plan) {
    if (!confirm(`Excluir o plano "${plan.name}"?`)) return
    try {
      await saFetch(`/super-admin/plans/${plan.id}`, { method: 'DELETE' })
      setPlans(prev => prev.filter(p => p.id !== plan.id))
    } catch (err) {
      alert((err as Error).message)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Planos ({plans.length})</h2>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          <Plus className="h-4 w-4" /> Novo Plano
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Preço</th>
                <th className="px-4 py-3 font-medium">Entregadores</th>
                <th className="px-4 py-3 font-medium">Entregas/mês</th>
                <th className="px-4 py-3 font-medium">Features</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      {!p.isActive && (
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                          inativo
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{fmtPrice(p.priceCents)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Users className="h-3.5 w-3.5 text-gray-400" /> {fmtLimit(p.maxDeliverers)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-700">
                      <Package className="h-3.5 w-3.5 text-gray-400" /> {fmtLimit(p.maxOrdersPerMonth)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {p.features.length === 0
                        ? <span className="text-xs text-gray-400">—</span>
                        : p.features.map(f => (
                          <span key={f.id} className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                            {FEATURE_LABEL[f.name] ?? f.name}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(p)} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p)} className="rounded-md p-1.5 text-gray-300 hover:bg-red-50 hover:text-red-500" title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {plans.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">Nenhum plano cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <PlanModal
          plan={editing}
          features={features}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function PlanModal({
  plan, features, onClose, onSaved,
}: {
  plan:     Plan | null
  features: Feature[]
  onClose:  () => void
  onSaved:  () => void
}) {
  const isEdit = !!plan
  const [name,        setName]        = useState(plan?.name ?? '')
  const [price,       setPrice]       = useState(plan ? String(plan.priceCents / 100) : '')
  const [deliverers,  setDeliverers]  = useState(plan?.maxDeliverers != null ? String(plan.maxDeliverers) : '')
  const [orders,      setOrders]      = useState(plan?.maxOrdersPerMonth != null ? String(plan.maxOrdersPerMonth) : '')
  const [sortOrder,   setSortOrder]   = useState(String(plan?.sortOrder ?? 0))
  const [isActive,    setIsActive]    = useState(plan?.isActive ?? true)
  const [featureIds,  setFeatureIds]  = useState<string[]>(plan?.features.map(f => f.id) ?? [])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  function toggleFeature(id: string) {
    setFeatureIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const payload = {
        name:              name.trim(),
        priceCents:        Math.round(parseFloat(price || '0') * 100),
        maxDeliverers:     deliverers.trim() === '' ? null : parseInt(deliverers, 10),
        maxOrdersPerMonth: orders.trim() === ''     ? null : parseInt(orders, 10),
        sortOrder:         parseInt(sortOrder || '0', 10),
        isActive,
        featureIds,
      }
      if (isEdit) {
        await saFetch(`/super-admin/plans/${plan!.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        await saFetch('/super-admin/plans', { method: 'POST', body: JSON.stringify(payload) })
      }
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar Plano' : 'Novo Plano'}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Preço (R$/mês)</label>
              <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="0,00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Ordem</label>
              <input type="number" value={sortOrder} onChange={e => setSortOrder(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Máx. entregadores</label>
              <input type="number" min="1" value={deliverers} onChange={e => setDeliverers(e.target.value)} placeholder="Ilimitado"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Máx. entregas/mês</label>
              <input type="number" min="1" value={orders} onChange={e => setOrders(e.target.value)} placeholder="Ilimitado"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-400">Deixe os limites em branco para ilimitado.</p>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Features incluídas</label>
            <div className="space-y-1.5">
              {features.map(f => (
                <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={featureIds.includes(f.id)} onChange={() => toggleFeature(f.id)} className="h-4 w-4" />
                  <span className="font-medium text-gray-800">{FEATURE_LABEL[f.name] ?? f.name}</span>
                  {f.description && <span className="truncate text-xs text-gray-400">— {f.description}</span>}
                </label>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4" />
            Plano ativo
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2 pb-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50">
              <Check className="h-4 w-4" />
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
