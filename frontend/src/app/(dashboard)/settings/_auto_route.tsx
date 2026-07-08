'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Save, Shuffle, ArrowUp, ArrowDown, X, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Deliverer } from '@/types'

interface AutoRouteConfigResponse {
  config: {
    enabled:     boolean
    waitMinutes: number
    queueSize:   number
    maxOrders:   number | null
  }
  rodizio: { delivererId: string; name: string; status: string; isActive: boolean }[]
}

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: 'bg-green-500',
  ON_ROUTE:  'bg-blue-500',
  OFFLINE:   'bg-gray-300',
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
          <Shuffle className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-semibold text-gray-900">Rotas automáticas</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export function AutoRouteSection({ onSaved }: { onSaved: () => void }) {
  const { can } = useAccess()
  const allowed = can({ scope: 'routes:auto_config' })

  const { data, mutate } = useSWR<AutoRouteConfigResponse>(
    allowed ? '/store/auto-routes/config' : null,
    (u: string) => api.get<AutoRouteConfigResponse>(u),
  )
  const { data: deliverers = [] } = useSWR<Deliverer[]>(
    allowed ? '/deliverers' : null,
    (u: string) => api.get<Deliverer[]>(u),
  )

  const [enabled,     setEnabled]     = useState(false)
  const [waitMinutes, setWaitMinutes] = useState(15)
  const [queueSize,   setQueueSize]   = useState(5)
  const [maxOrders,   setMaxOrders]   = useState<number | ''>('')  // '' = todos (sem cap)
  const [rodizio,     setRodizio]     = useState<string[]>([])     // ordem dos delivererIds
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (data) {
      setEnabled(data.config.enabled)
      setWaitMinutes(data.config.waitMinutes)
      setQueueSize(data.config.queueSize)
      setMaxOrders(data.config.maxOrders ?? '')
      setRodizio(data.rodizio.map(r => r.delivererId))
    }
  }, [data])

  if (!allowed) return null

  const nameOf = (id: string) => deliverers.find(d => d.id === id)?.name ?? '—'
  const statusOf = (id: string) => deliverers.find(d => d.id === id)?.status ?? 'OFFLINE'
  const available = deliverers.filter(d => d.isActive && !rodizio.includes(d.id))

  function move(idx: number, dir: -1 | 1) {
    const next = [...rodizio]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setRodizio(next)
  }
  function remove(id: string) { setRodizio(rodizio.filter(x => x !== id)) }
  function add(id: string) { if (id && !rodizio.includes(id)) setRodizio([...rodizio, id]) }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      await api.put('/store/auto-routes/config', {
        enabled,
        waitMinutes,
        queueSize,
        maxOrders: maxOrders === '' ? null : Number(maxOrders),
        delivererIds: rodizio,
      })
      mutate()
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Cria rotas automaticamente quando a fila de pedidos em preparação cresce, distribuindo o
          trabalho por um rodízio de entregadores. Antes de bater a condição, qualquer entregador
          ainda pode retirar os pedidos normalmente.
        </p>

        {/* Toggle ativar */}
        <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Ativar rotas automáticas</p>
            <p className="text-xs text-gray-500">Distribui a fila de pedidos pelo rodízio configurado abaixo</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(v => !v)}
            className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            style={{ background: enabled ? 'var(--color-primary)' : '#E5E7EB' }}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {enabled && (
          <>
            {/* Gatilhos */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <label className="block text-sm font-medium text-gray-900">Tempo de espera</label>
                <p className="mt-0.5 mb-2 text-xs text-gray-500">Cria a rota se o pedido mais antigo esperar mais que isto</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={1} max={720}
                    value={waitMinutes}
                    onChange={(e) => setWaitMinutes(Math.max(1, Math.min(720, Number(e.target.value) || 0)))}
                    className="w-28"
                  />
                  <span className="text-xs text-gray-500">minutos</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <label className="block text-sm font-medium text-gray-900">Tamanho da fila</label>
                <p className="mt-0.5 mb-2 text-xs text-gray-500">Cria a rota quando houver esta quantidade de pedidos aguardando</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min={1} max={100}
                    value={queueSize}
                    onChange={(e) => setQueueSize(Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                    className="w-28"
                  />
                  <span className="text-xs text-gray-500">pedidos</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-900">Máximo de pedidos por rota (opcional)</label>
              <p className="mt-0.5 mb-2 text-xs text-gray-500">Deixe vazio para incluir todos os pedidos que estavam em preparação</p>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={1} max={100}
                  value={maxOrders}
                  placeholder="Todos"
                  onChange={(e) => setMaxOrders(e.target.value === '' ? '' : Math.max(1, Math.min(100, Number(e.target.value) || 0)))}
                  className="w-28"
                />
                <span className="text-xs text-gray-500">pedidos</span>
              </div>
            </div>

            {/* Rodízio */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Rodízio de entregadores</p>
              <p className="mt-0.5 mb-3 text-xs text-gray-500">
                A rota é atribuída ao &quot;entregador da vez&quot; nesta ordem. Se ele estiver offline, passa ao próximo.
              </p>

              {rodizio.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-400">
                  Nenhum entregador no rodízio. Adicione abaixo.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rodizio.map((id, idx) => (
                    <li key={id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-700">{idx + 1}</span>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[statusOf(id)] ?? 'bg-gray-300'}`} />
                      <span className="flex-1 truncate text-sm text-gray-900">{nameOf(id)}</span>
                      <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Subir">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => move(idx, 1)} disabled={idx === rodizio.length - 1} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Descer">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => remove(id)} className="rounded p-1 text-gray-400 hover:text-red-600" aria-label="Remover">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {available.length > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value=""
                    onChange={(e) => { add(e.target.value); e.target.value = '' }}
                    className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="" disabled>Adicionar entregador…</option>
                    {available.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <Plus className="h-4 w-4 text-gray-400" />
                </div>
              )}
            </div>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {loading ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </div>
    </Card>
  )
}
