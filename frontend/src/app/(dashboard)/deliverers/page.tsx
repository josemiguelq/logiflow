'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Plus, Truck, Map, Pencil, PowerOff, Power, WifiOff, Eye, Copy, Check, Trash2, Loader2, List } from 'lucide-react'
import { Deliverer } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccess } from '@/hooks/useAccess'
import { useWs } from '@/hooks/WsContext'
import { LiveMap, type FleetMember } from '@/components/map'

const STATUS_MAP = {
  AVAILABLE: { label: 'Disponível', dot: 'bg-green-500' },
  ON_ROUTE:  { label: 'Em rota',    dot: 'bg-orange-500' },
  OFFLINE:   { label: 'Offline',    dot: 'bg-gray-300' },
}

export default function DeliverersPage() {
  const [showCreate, setShowCreate]           = useState(false)
  const [editing, setEditing]                 = useState<Deliverer | null>(null)
  const [forcingOffline, setForcingOffline]   = useState<string | null>(null)
  const [deleting, setDeleting]               = useState<Deliverer | null>(null)
  const [deleteLoading, setDeleteLoading]     = useState(false)
  const [view, setView]                       = useState<'list' | 'map'>('list')
  const { data: deliverers = [], mutate } = useSWR<Deliverer[]>(
    '/deliverers',
    (url: string) => api.get<Deliverer[]>(url)
  )
  const { can } = useAccess()
  const canDelete = can({ scope: 'deliverers:delete' })

  const available = deliverers.filter((d) => d.isActive && d.status === 'AVAILABLE').length
  const onRoute   = deliverers.filter((d) => d.isActive && d.status === 'ON_ROUTE').length

  async function toggleActive(d: Deliverer) {
    await api.patch(`/deliverers/${d.id}/active`, { active: !d.isActive })
    mutate()
  }

  async function forceOffline(d: Deliverer) {
    if (!confirm(`Forçar ${d.name} para OFFLINE?`)) return
    setForcingOffline(d.id)
    try {
      await api.patch(`/deliverers/${d.id}/force-offline`, {})
      mutate()
    } finally {
      setForcingOffline(null)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await api.delete(`/deliverers/${deleting.id}`)
      setDeleting(null)
      mutate()
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entregadores</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {deliverers.filter((d) => d.isActive).length} ativo(s) · {available} disponível(is) · {onRoute} em rota
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <List className="h-4 w-4" />
              Lista
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'map' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Map className="h-4 w-4" />
              Mapa
            </button>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Novo Entregador
          </Button>
        </div>
      </div>

      <InviteCodeCard />

      {view === 'map' ? (
        <FleetMapView />
      ) : (
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {deliverers.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <Truck className="mb-3 h-10 w-10" />
            <p className="font-medium">Nenhum entregador cadastrado</p>
            <p className="mt-1 text-sm">Adicione o primeiro entregador para começar</p>
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Nome</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Username</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Primeiro acesso</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Termos</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deliverers.map((d) => {
                const st       = STATUS_MAP[d.status] ?? STATUS_MAP.OFFLINE
                const inactive = !d.isActive

                return (
                  <tr key={d.id} className={`transition-colors ${inactive ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                          style={{ background: inactive ? '#9ca3af' : 'var(--color-primary)' }}
                        >
                          {d.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <Link
                            href={`/deliverers/${d.id}`}
                            className="font-medium text-gray-900 hover:underline"
                          >
                            {d.name}
                          </Link>
                          {inactive && (
                            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                              Desativado
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">@{d.username}</td>
                    <td className="px-5 py-3.5">
                      {d.needsOnboarding ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Pendente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Concluído
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {d.termsAccepted ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
                          title={d.termsAcceptedAt ? `Aceito em ${new Date(d.termsAcceptedAt).toLocaleString('pt-BR')}` : undefined}>
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          Aceitos
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {inactive ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-gray-700">
                          <span className={`h-2 w-2 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/deliverers/${d.id}`}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          title="Ver detalhes"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        {!inactive && can({ scope: 'deliverers:track' }) && (
                          <Link
                            href={`/tracking/deliverer/${d.id}`}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                            title="Rastrear"
                          >
                            <Map className="h-4 w-4" />
                          </Link>
                        )}
                        <button
                          onClick={() => setEditing(d)}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {!inactive && d.status !== 'OFFLINE' && can({ scope: 'deliverers:force_offline' }) && (
                          <button
                            onClick={() => forceOffline(d)}
                            disabled={forcingOffline === d.id}
                            className="rounded-lg p-1.5 text-orange-400 transition-colors hover:bg-orange-50 hover:text-orange-600 disabled:opacity-40"
                            title="Forçar offline"
                          >
                            <WifiOff className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleActive(d)}
                          className={`rounded-lg p-1.5 transition-colors ${
                            inactive
                              ? 'text-green-500 hover:bg-green-50 hover:text-green-700'
                              : 'text-red-400 hover:bg-red-50 hover:text-red-600'
                          }`}
                          title={inactive ? 'Ativar' : 'Desativar'}
                        >
                          {inactive ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                        </button>
                        {canDelete && (
                          <button
                            onClick={() => setDeleting(d)}
                            className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {showCreate && (
        <DelivererFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); mutate() }}
        />
      )}

      {editing && (
        <DelivererFormModal
          deliverer={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); mutate() }}
        />
      )}

      {deleting && (
        <DeleteModal
          name={deleting.name}
          loading={deleteLoading}
          onConfirm={confirmDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

// Confirmação de exclusão (soft delete). Deixa claro que o histórico/pedidos
// do entregador são preservados — diferente de "desativar".
function DeleteModal({ name, loading, onConfirm, onClose }: {
  name: string
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Excluir entregador</h2>
            <p className="mt-1 text-sm text-gray-500">
              O entregador <span className="font-medium">{name}</span> será excluído e some das listas.
              Os pedidos e o histórico de entregas dele são preservados.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {loading ? 'Excluindo…' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Mapa da frota: posição atual de todos os entregadores + tracejado ao vivo.
// O rastro é construído a partir dos pings do WebSocket (sem carga de histórico),
// mantendo apenas uma janela rolante de ~3h por entregador.
const TRAIL_WINDOW_MS = 3 * 60 * 60 * 1000

type LivePoint = { lat: number; lng: number; recorded_at: string }

interface LatestPos {
  deliverer_id: string
  name:         string
  status:       string
  // Últimos 25 pontos (cronológicos) — semeiam o tracejado ao abrir o mapa.
  points:       LivePoint[]
}

function FleetMapView() {
  const { on, onReconnect } = useWs()
  const { data: latest = [], mutate } = useSWR<LatestPos[]>(
    '/tracking/deliverers/latest',
    (u: string) => api.get<LatestPos[]>(u),
    { refreshInterval: 30_000 }
  )

  // Posição + rastro por entregador, alimentados ao vivo pelo WebSocket.
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; trail: LivePoint[] }>>({})

  // Semeia o tracejado com os últimos 25 pontos de quem ainda não tem estado
  // (sem reescrever o rastro já crescido ao vivo).
  useEffect(() => {
    setLive((prev) => {
      const next = { ...prev }
      for (const p of latest) {
        if (next[p.deliverer_id] || p.points.length === 0) continue
        const last = p.points[p.points.length - 1]!
        next[p.deliverer_id] = { lat: last.lat, lng: last.lng, trail: p.points }
      }
      return next
    })
  }, [latest])

  // Cada ping move a bolinha e cresce o tracejado, descartando pontos > 3h.
  useEffect(() => {
    return on('deliverer_location', (data: unknown) => {
      const d = data as { delivererId: string; lat: number; lng: number }
      if (d.lat == null || d.lng == null) return
      const now = Date.now()
      setLive((prev) => {
        const cur = prev[d.delivererId]
        const point: LivePoint = { lat: d.lat, lng: d.lng, recorded_at: new Date(now).toISOString() }
        const trail = [...(cur?.trail ?? []), point].filter(
          (pt) => now - new Date(pt.recorded_at).getTime() <= TRAIL_WINDOW_MS
        )
        return { ...prev, [d.delivererId]: { lat: d.lat, lng: d.lng, trail } }
      })
    })
  }, [on])

  useEffect(() => onReconnect(() => mutate()), [onReconnect, mutate])

  const fleet: FleetMember[] = latest.flatMap((p) => {
    const l    = live[p.deliverer_id]
    const last = p.points[p.points.length - 1]
    const lat  = l?.lat ?? last?.lat
    const lng  = l?.lng ?? last?.lng
    if (lat == null || lng == null) return []
    return [{
      id:     p.deliverer_id,
      name:   p.name,
      lat,
      lng,
      status: (STATUS_MAP[p.status as keyof typeof STATUS_MAP] ?? STATUS_MAP.OFFLINE).label,
      trail:  l?.trail ?? p.points,
    }]
  })

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="h-[calc(100vh-260px)] min-h-[400px] w-full">
        <LiveMap fleet={fleet} height="100%" />
      </div>
      <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
        {fleet.length} entregador{fleet.length !== 1 ? 'es' : ''} no mapa
        <span className="text-gray-400"> · últimos 25 pontos + ao vivo</span>
      </div>
    </div>
  )
}

// Código de convite da loja: o entregador digita no app (login v2) para
// selecionar a loja antes de entrar com username e senha.
function InviteCodeCard() {
  const { data } = useSWR<{ code: string | null }>(
    '/deliverers/invite-code',
    (url: string) => api.get<{ code: string | null }>(url)
  )
  const [copied, setCopied] = useState(false)
  const code = data?.code

  if (!code) return null

  async function copy() {
    await navigator.clipboard.writeText(code!)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-medium text-gray-900">Código de convite da loja</p>
        <p className="mt-0.5 text-xs text-gray-500">
          O entregador digita este código no app para selecionar sua loja ao fazer login.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono text-lg font-bold tracking-widest text-gray-900">
          {code}
        </span>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          title="Copiar código"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}

interface FormModalProps {
  deliverer?: Deliverer
  onClose: () => void
  onSaved: () => void
}

function DelivererFormModal({ deliverer, onClose, onSaved }: FormModalProps) {
  const isEdit = !!deliverer
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const fd = new FormData(e.currentTarget)

    try {
      if (isEdit) {
        const password = (fd.get('password') as string) || undefined
        await api.patch(`/deliverers/${deliverer.id}`, {
          name:     fd.get('name'),
          email:    (fd.get('email') as string) || null,
          username: fd.get('username'),
          ...(password ? { password } : {}),
        })
      } else {
        await api.post('/deliverers', {
          name:     fd.get('name'),
          username: fd.get('username'),
          email:    (fd.get('email') as string) || undefined,
          password: fd.get('password'),
        })
      }
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">
          {isEdit ? 'Editar Entregador' : 'Novo Entregador'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nome completo</label>
            <Input name="name" required defaultValue={deliverer?.name} placeholder="Ex: Carlos Silva" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Username <span className="text-gray-400">(usado no app)</span>
            </label>
            <Input
              name="username"
              required
              defaultValue={deliverer?.username}
              placeholder="carlos.silva"
              pattern="[a-z0-9_.]+"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              E-mail <span className="text-gray-400">(opcional)</span>
            </label>
            <Input name="email" type="email" defaultValue={deliverer?.email} placeholder="carlos@email.com" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Senha {isEdit && <span className="text-gray-400">(deixe em branco para não alterar)</span>}
            </label>
            <Input
              name="password"
              type="password"
              required={!isEdit}
              minLength={isEdit ? undefined : 6}
              placeholder={isEdit ? 'Nova senha (opcional)' : 'Mínimo 6 caracteres'}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Salvando...' : isEdit ? 'Salvar' : 'Cadastrar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
