'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Store, Zap, Palette, X, Users, Trash2, ChevronDown, ChevronUp,
  CheckCircle, Download, Info, MapPin, Calendar, Package, Truck, Star,
  CreditCard, AlertTriangle, Clock, ShieldCheck, Pencil, Check,
} from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface Feature {
  id:          string
  name:        string
  description: string
}

interface StoreRow {
  id:              string
  name:            string
  createdAt:       string
  deliveredCount:  number
  enabledFeatures: string[]
}

interface StoreUser {
  id:        string
  name:      string
  email:     string
  username:  string
  role:      'OWNER' | 'MANAGER' | 'ASSISTANT'
  createdAt: string
}

interface Payment {
  id:             string
  referenceMonth: string
  paidAt:         string
  notes:          string | null
}

interface BillingInfo {
  status:          'trial' | 'ok' | 'grace' | 'blocked'
  trialEndsAt:     string | null
  billingDay:      number
  lastBillingDate: string | null
  gracePeriodEnd:  string | null
  requiredMonth:   string | null
  paid:            boolean
  payments:        Payment[]
}

interface StoreDetail {
  id:                  string
  name:                string
  createdAt:           string
  street:              string | null
  streetNumber:        string | null
  city:                string | null
  lat:                 number | null
  lng:                 number | null
  userCount:           number
  deliveriesLastMonth: number
  enabledFeatures:     Feature[]
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

const FEATURE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  whatsapp:         { label: 'WhatsApp',   icon: <Zap className="h-3.5 w-3.5" /> },
  custom_theme:     { label: 'Tema',       icon: <Palette className="h-3.5 w-3.5" /> },
  csv_export:       { label: 'CSV',        icon: <Download className="h-3.5 w-3.5" /> },
  customer_ratings: { label: 'Avaliações', icon: <Star className="h-3.5 w-3.5" /> },
}

export default function SuperAdminStoresPage() {
  const router  = useRouter()
  const [stores,          setStores]          = useState<StoreRow[]>([])
  const [features,        setFeatures]        = useState<Feature[]>([])
  const [loading,         setLoading]         = useState(true)
  const [showForm,        setShowForm]        = useState(false)
  const [expandedStoreId, setExpandedStoreId] = useState<string | null>(null)
  const [createUserFor,   setCreateUserFor]   = useState<StoreRow | null>(null)
  const [detailStore,     setDetailStore]     = useState<StoreDetail | null>(null)
  const [detailLoading,   setDetailLoading]   = useState(false)
  const [billingStore,    setBillingStore]    = useState<StoreRow | null>(null)
  const [billingInfo,     setBillingInfo]     = useState<BillingInfo | null>(null)
  const [billingLoading,  setBillingLoading]  = useState(false)
  const [renamingId,      setRenamingId]      = useState<string | null>(null)
  const [renameValue,     setRenameValue]     = useState('')
  const [renameSaving,    setRenameSaving]    = useState(false)

  const load = useCallback(async () => {
    try {
      const [storeData, featureData] = await Promise.all([
        saFetch<StoreRow[]>('/super-admin/stores'),
        saFetch<Feature[]>('/super-admin/features'),
      ])
      setStores(storeData)
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

  function startRename(store: StoreRow) {
    setRenamingId(store.id)
    setRenameValue(store.name)
  }

  async function saveRename(storeId: string) {
    const name = renameValue.trim()
    if (!name) return
    setRenameSaving(true)
    try {
      await saFetch(`/super-admin/stores/${storeId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, name } : s))
      setRenamingId(null)
    } finally {
      setRenameSaving(false)
    }
  }

  async function openBilling(store: StoreRow) {
    setBillingStore(store)
    setBillingInfo(null)
    setBillingLoading(true)
    try {
      const data = await saFetch<BillingInfo>(`/super-admin/stores/${store.id}/billing`)
      setBillingInfo(data)
    } finally {
      setBillingLoading(false)
    }
  }

  async function openDetail(storeId: string) {
    setDetailLoading(true)
    setDetailStore(null)
    try {
      const data = await saFetch<StoreDetail>(`/super-admin/stores/${storeId}`)
      setDetailStore(data)
    } finally {
      setDetailLoading(false)
    }
  }

  async function toggleFeature(store: StoreRow, feature: Feature) {
    const isEnabled = store.enabledFeatures.includes(feature.name)
    if (isEnabled) {
      await saFetch(`/super-admin/stores/${store.id}/features-enabled/${feature.id}`, { method: 'DELETE' })
      setStores(prev => prev.map(s => s.id === store.id
        ? { ...s, enabledFeatures: s.enabledFeatures.filter(n => n !== feature.name) }
        : s
      ))
    } else {
      await saFetch(`/super-admin/stores/${store.id}/features-enabled`, {
        method: 'POST',
        body: JSON.stringify({ featureId: feature.id }),
      })
      setStores(prev => prev.map(s => s.id === store.id
        ? { ...s, enabledFeatures: [...s.enabledFeatures, feature.name] }
        : s
      ))
    }
  }

  function toggleExpand(storeId: string) {
    setExpandedStoreId(prev => prev === storeId ? null : storeId)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Lojas ({stores.length})</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
        >
          <Plus className="h-4 w-4" /> Nova Loja
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
        </div>
      ) : (
        <div className="space-y-3">
          {stores.map(s => (
            <div key={s.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-start justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                    <Store className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    {renamingId === s.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(s.id)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-900 focus:border-gray-500 focus:outline-none"
                          maxLength={80}
                        />
                        <button
                          onClick={() => saveRename(s.id)}
                          disabled={renameSaving}
                          className="flex items-center justify-center rounded-md bg-gray-900 p-1.5 text-white hover:bg-gray-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="flex items-center justify-center rounded-md border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-gray-900">{s.name}</p>
                        <button
                          onClick={() => startRename(s)}
                          className="rounded p-0.5 text-gray-400 hover:text-gray-700"
                          title="Renomear loja"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
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

                <div className="flex flex-wrap items-center gap-2">
                  {features.map(f => (
                    <FeatureToggle
                      key={f.id}
                      label={(FEATURE_META[f.name]?.label) ?? f.name}
                      icon={FEATURE_META[f.name]?.icon ?? null}
                      enabled={s.enabledFeatures.includes(f.name)}
                      onChange={() => toggleFeature(s, f)}
                    />
                  ))}
                  <button
                    onClick={() => openDetail(s.id)}
                    className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    <Info className="h-3.5 w-3.5" />
                    Detalhes
                  </button>
                  <button
                    onClick={() => openBilling(s)}
                    className="flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    Cobrança
                  </button>
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

      {/* Detail drawer */}
      {(detailStore || detailLoading) && (
        <StoreDetailDrawer
          detail={detailStore}
          loading={detailLoading}
          onClose={() => { setDetailStore(null); setDetailLoading(false) }}
        />
      )}

      {/* Billing drawer */}
      {billingStore && (
        <StoreBillingDrawer
          store={billingStore}
          info={billingInfo}
          loading={billingLoading}
          onClose={() => { setBillingStore(null); setBillingInfo(null) }}
          onRefresh={() => openBilling(billingStore)}
        />
      )}
    </div>
  )
}

// ── Billing Drawer ─────────────────────────────────────────────────────────────

const BILLING_STATUS_META = {
  trial:   { label: 'Trial',              color: 'bg-blue-100 text-blue-700',   icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  ok:      { label: 'Em dia',             color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  grace:   { label: 'Período de graça',   color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3.5 w-3.5" /> },
  blocked: { label: 'Bloqueada',          color: 'bg-red-100 text-red-700',     icon: <AlertTriangle className="h-3.5 w-3.5" /> },
}

function fmtMonth(iso: string) {
  // "2025-06-01" → "jun/2025"
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function StoreBillingDrawer({
  store, info, loading, onClose, onRefresh,
}: {
  store:     StoreRow
  info:      BillingInfo | null
  loading:   boolean
  onClose:   () => void
  onRefresh: () => void
}) {
  const [editingTrial,   setEditingTrial]   = useState(false)
  const [trialValue,     setTrialValue]     = useState('')
  const [editingDay,     setEditingDay]     = useState(false)
  const [dayValue,       setDayValue]       = useState('')
  const [newMonth,       setNewMonth]       = useState('')
  const [newNotes,       setNewNotes]       = useState('')
  const [saving,         setSaving]         = useState(false)
  const [addingPayment,  setAddingPayment]  = useState(false)

  async function saveTrial() {
    setSaving(true)
    try {
      await saFetch(`/super-admin/stores/${store.id}/billing`, {
        method: 'PATCH',
        body: JSON.stringify({ trialEndsAt: trialValue }),
      })
      setEditingTrial(false)
      onRefresh()
    } finally { setSaving(false) }
  }

  async function saveDay() {
    const d = parseInt(dayValue)
    if (isNaN(d) || d < 1 || d > 28) return
    setSaving(true)
    try {
      await saFetch(`/super-admin/stores/${store.id}/billing`, {
        method: 'PATCH',
        body: JSON.stringify({ billingDay: d }),
      })
      setEditingDay(false)
      onRefresh()
    } finally { setSaving(false) }
  }

  async function addPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!newMonth) return
    setAddingPayment(true)
    try {
      await saFetch(`/super-admin/stores/${store.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({ referenceMonth: newMonth, notes: newNotes || undefined }),
      })
      setNewMonth(''); setNewNotes('')
      onRefresh()
    } finally { setAddingPayment(false) }
  }

  async function deletePayment(paymentId: string) {
    if (!confirm('Remover este registro de pagamento?')) return
    await saFetch(`/super-admin/stores/${store.id}/payments/${paymentId}`, { method: 'DELETE' })
    onRefresh()
  }

  const statusMeta = info ? BILLING_STATUS_META[info.status] : null

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-900">Cobrança — {store.name}</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
            </div>
          ) : info ? (
            <>
              {/* Status */}
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${statusMeta!.color}`}>
                  {statusMeta!.icon}
                  {statusMeta!.label}
                </span>
                {info.status === 'blocked' && (
                  <p className="text-xs text-red-600">Criação de pedidos bloqueada</p>
                )}
                {info.status === 'grace' && info.gracePeriodEnd && (
                  <p className="text-xs text-yellow-700">Vence em {fmtDate(info.gracePeriodEnd)}</p>
                )}
              </div>

              {/* Info chips */}
              {info.requiredMonth && !info.paid && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Pagamento pendente: <span className="font-semibold">{fmtMonth(info.requiredMonth)}</span>
                </div>
              )}

              {/* Trial configuration */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Fim do trial
                </p>
                {editingTrial ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={trialValue}
                      onChange={e => setTrialValue(e.target.value)}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      onClick={saveTrial}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button onClick={() => setEditingTrial(false)} className="text-xs text-gray-400 hover:text-gray-600">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">
                      {info.trialEndsAt ? fmtDate(info.trialEndsAt) : 'Não configurado'}
                    </span>
                    <button
                      onClick={() => { setTrialValue(info.trialEndsAt ?? ''); setEditingTrial(true) }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </div>
                )}
              </section>

              {/* Billing day configuration */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Dia de vencimento (mensal)
                </p>
                {editingDay ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={1} max={28}
                      value={dayValue}
                      onChange={e => setDayValue(e.target.value)}
                      className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <span className="text-sm text-gray-500">de cada mês</span>
                    <button
                      onClick={saveDay}
                      disabled={saving}
                      className="flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Salvar
                    </button>
                    <button onClick={() => setEditingDay(false)} className="text-xs text-gray-400 hover:text-gray-600">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">
                      Todo dia <strong>{info.billingDay}</strong>
                    </span>
                    <button
                      onClick={() => { setDayValue(String(info.billingDay)); setEditingDay(true) }}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                  </div>
                )}
              </section>

              {/* Add payment */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Registrar pagamento
                </p>
                <form onSubmit={addPayment} className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="month"
                      value={newMonth}
                      onChange={e => setNewMonth(e.target.value)}
                      required
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={addingPayment || !newMonth}
                      className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {addingPayment ? 'Salvando...' : 'Registrar'}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Observação (opcional)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </form>
              </section>

              {/* Payment history */}
              <section>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Histórico de pagamentos
                </p>
                {info.payments.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum pagamento registrado</p>
                ) : (
                  <div className="space-y-2">
                    {info.payments.map(p => (
                      <div
                        key={p.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-800 capitalize">
                            {fmtMonth(p.referenceMonth)}
                          </p>
                          <p className="text-xs text-gray-400">
                            Registrado em {fmtDate(p.paidAt)}
                          </p>
                          {p.notes && (
                            <p className="mt-0.5 text-xs text-gray-500">{p.notes}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deletePayment(p.id)}
                          className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

// ── Store Detail Drawer ────────────────────────────────────────────────────────

function StoreDetailDrawer({
  detail, loading, onClose,
}: {
  detail:  StoreDetail | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 px-5">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-900">
              {detail ? detail.name : 'Detalhes da loja'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
            </div>
          ) : detail ? (
            <div className="space-y-6">
              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Users className="h-4 w-4 text-blue-500" />}
                  label="Usuários"
                  value={detail.userCount}
                  bg="bg-blue-50"
                />
                <StatCard
                  icon={<Truck className="h-4 w-4 text-green-500" />}
                  label="Entregas (30 dias)"
                  value={detail.deliveriesLastMonth}
                  bg="bg-green-50"
                />
              </div>

              {/* Info rows */}
              <div className="space-y-3">
                <DetailRow
                  icon={<Calendar className="h-4 w-4 text-gray-400" />}
                  label="Criada em"
                  value={new Date(detail.createdAt).toLocaleDateString('pt-BR', {
                    day: '2-digit', month: 'long', year: 'numeric',
                  })}
                />
                <DetailRow
                  icon={<Package className="h-4 w-4 text-gray-400" />}
                  label="ID"
                  value={<span className="font-mono text-xs">{detail.id}</span>}
                />
                <DetailRow
                  icon={<MapPin className="h-4 w-4 text-gray-400" />}
                  label="Endereço"
                  value={
                    detail.street
                      ? [
                          detail.street,
                          detail.streetNumber,
                          detail.city,
                        ].filter(Boolean).join(', ')
                      : detail.lat != null
                        ? `${detail.lat.toFixed(5)}, ${detail.lng?.toFixed(5)}`
                        : 'Não configurado'
                  }
                />
              </div>

              {/* Features */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Funcionalidades ativas
                </p>
                {detail.enabledFeatures.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma funcionalidade habilitada</p>
                ) : (
                  <div className="space-y-2">
                    {detail.enabledFeatures.map(f => (
                      <div
                        key={f.id}
                        className="flex items-center gap-2.5 rounded-lg border border-green-100 bg-green-50 px-3 py-2"
                      >
                        <CheckCircle className="h-3.5 w-3.5 shrink-0 text-green-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {FEATURE_META[f.name]?.label ?? f.name}
                          </p>
                          <p className="truncate text-xs text-gray-500">{f.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}

function StatCard({
  icon, label, value, bg,
}: {
  icon:  React.ReactNode
  label: string
  value: number
  bg:    string
}) {
  return (
    <div className={`rounded-xl border border-gray-100 ${bg} px-4 py-3`}>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

function DetailRow({
  icon, label, value,
}: {
  icon:  React.ReactNode
  label: string
  value: string | React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-gray-800 break-all">{value}</p>
      </div>
    </div>
  )
}

// ── Store Users Panel ──────────────────────────────────────────────────────────

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

// ── Feature Toggle ─────────────────────────────────────────────────────────────

function FeatureToggle({
  label, icon, enabled, onChange,
}: {
  label:    string
  icon:     React.ReactNode
  enabled:  boolean
  onChange: () => void
}) {
  return (
    <button
      onClick={onChange}
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

// ── Modals ────────────────────────────────────────────────────────────────────

async function geocodeAddress(street: string, number: string, city: string) {
  const q = `${street}, ${number}, ${city}, Brasil`
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=1&q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'LogiFlow/1.0' } })
  const data = await res.json()
  if (!data[0]) return null
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

function CreateStoreModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [storeName,     setStoreName]     = useState('')
  const [ownerName,     setOwnerName]     = useState('')
  const [ownerEmail,    setOwnerEmail]    = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [street,        setStreet]        = useState('')
  const [streetNumber,  setStreetNumber]  = useState('')
  const [city,          setCity]          = useState('')
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      let lat: number | undefined
      let lng: number | undefined
      if (street && streetNumber && city) {
        const coords = await geocodeAddress(street, streetNumber, city)
        if (coords) { lat = coords.lat; lng = coords.lng }
      }
      await saFetch('/super-admin/stores', {
        method: 'POST',
        body: JSON.stringify({
          storeName, ownerName, ownerEmail, ownerPassword,
          street:       street       || undefined,
          streetNumber: streetNumber || undefined,
          city:         city         || undefined,
          lat,
          lng,
        }),
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
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Nova Loja</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome da loja</label>
            <input value={storeName} onChange={e => setStoreName(e.target.value)} required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>

          <hr className="border-gray-100" />
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Endereço</p>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rua</label>
            <input value={street} onChange={e => setStreet(e.target.value)} placeholder="Ex: Rua das Flores"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Número</label>
              <input value={streetNumber} onChange={e => setStreetNumber(e.target.value)} placeholder="Ex: 123"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Cidade</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ex: São Paulo"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
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
          <div className="flex gap-3 pt-2 pb-2">
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
  store:     StoreRow
  onClose:   () => void
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
