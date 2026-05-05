'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Plus, Truck, Map, Pencil, PowerOff, Power } from 'lucide-react'
import { Deliverer } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const STATUS_MAP = {
  AVAILABLE: { label: 'Disponível', dot: 'bg-green-500' },
  ON_ROUTE:  { label: 'Em rota',    dot: 'bg-orange-500' },
  OFFLINE:   { label: 'Offline',    dot: 'bg-gray-300' },
}

export default function DeliverersPage() {
  const [showCreate, setShowCreate]           = useState(false)
  const [editing, setEditing]                 = useState<Deliverer | null>(null)
  const { data: deliverers = [], mutate } = useSWR<Deliverer[]>(
    '/deliverers',
    (url: string) => api.get<Deliverer[]>(url)
  )

  const available = deliverers.filter((d) => d.isActive && d.status === 'AVAILABLE').length
  const onRoute   = deliverers.filter((d) => d.isActive && d.status === 'ON_ROUTE').length

  async function toggleActive(d: Deliverer) {
    await api.patch(`/deliverers/${d.id}/active`, { active: !d.isActive })
    mutate()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Entregadores</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {deliverers.filter((d) => d.isActive).length} ativo(s) · {available} disponível(is) · {onRoute} em rota
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Novo Entregador
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {deliverers.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-gray-400">
            <Truck className="mb-3 h-10 w-10" />
            <p className="font-medium">Nenhum entregador cadastrado</p>
            <p className="mt-1 text-sm">Adicione o primeiro entregador para começar</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Nome</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Username</th>
                <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">E-mail</th>
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
                          <span className="font-medium text-gray-900">{d.name}</span>
                          {inactive && (
                            <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">
                              Desativado
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-gray-500">@{d.username}</td>
                    <td className="px-5 py-3.5 text-gray-500">{d.email ?? '—'}</td>
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
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {!inactive && (
                          <Link
                            href={`/tracking/deliverer/${d.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                          >
                            <Map className="h-3.5 w-3.5" />
                            Rastrear
                          </Link>
                        )}
                        <button
                          onClick={() => setEditing(d)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                        <button
                          onClick={() => toggleActive(d)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                            inactive
                              ? 'border-green-200 text-green-700 hover:bg-green-50'
                              : 'border-red-200 text-red-600 hover:bg-red-50'
                          }`}
                        >
                          {inactive ? (
                            <><Power className="h-3.5 w-3.5" />Ativar</>
                          ) : (
                            <><PowerOff className="h-3.5 w-3.5" />Desativar</>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

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
