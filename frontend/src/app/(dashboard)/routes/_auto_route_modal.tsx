'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Save, Shuffle, ArrowUp, ArrowDown, X, FlaskConical, CheckCircle2, AlertTriangle, Crown, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Deliverer } from '@/types'

interface AutoRouteConfigResponse {
  config: {
    enabled: boolean; waitMinutes: number; queueSize: number; maxOrders: number | null
    groupByRegion: boolean; regionRadiusKm: number | null
    fastDeliveryEnabled: boolean; fastDeliveryRadiusKm: number | null; fastDeliveryWaitMinutes: number | null
  }
  rodizio: { delivererId: string; name: string; status: string; isActive: boolean }[]
}

interface DryRunGroup {
  orders: { id: string; shortId: string; customerName: string; address: string; waitMinutes: number; isPriority: boolean }[]
  delivererId: string | null
  delivererName: string | null
  noEligibleDeliverer: boolean
  overflowCount: number
}

interface DryRunResult {
  wouldTrigger:   boolean
  triggerReasons: string[]
  preparingCount: number
  maxWaitMinutes: number
  groups: DryRunGroup[]
}

const STATUS_DOT: Record<string, string> = {
  AVAILABLE: 'bg-green-500',
  ON_ROUTE:  'bg-blue-500',
  OFFLINE:   'bg-gray-300',
}

export function AutoRouteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data, mutate } = useSWR<AutoRouteConfigResponse>(
    '/store/auto-routes/config',
    (u: string) => api.get<AutoRouteConfigResponse>(u),
  )
  const { data: deliverers = [] } = useSWR<Deliverer[]>('/deliverers', (u: string) => api.get<Deliverer[]>(u))

  const [enabled,     setEnabled]     = useState(false)
  const [waitMinutes, setWaitMinutes] = useState<number | ''>(15)
  const [queueSize,   setQueueSize]   = useState<number | ''>(5)
  const [maxOrders,   setMaxOrders]   = useState<number | ''>('')
  const [groupByRegion,  setGroupByRegion]  = useState(false)
  const [regionRadiusKm, setRegionRadiusKm] = useState<number | ''>('')
  const [fastDeliveryEnabled,     setFastDeliveryEnabled]     = useState(false)
  const [fastDeliveryRadiusKm,    setFastDeliveryRadiusKm]    = useState<number | ''>('')
  const [fastDeliveryWaitMinutes, setFastDeliveryWaitMinutes] = useState<number | ''>('')
  const [rodizio,     setRodizio]     = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const [dry, setDry]           = useState<DryRunResult | null>(null)
  const [dryLoading, setDryLoading] = useState(false)

  useEffect(() => {
    if (data) {
      setEnabled(data.config.enabled)
      setWaitMinutes(data.config.waitMinutes)
      setQueueSize(data.config.queueSize)
      setMaxOrders(data.config.maxOrders ?? '')
      setGroupByRegion(data.config.groupByRegion)
      setRegionRadiusKm(data.config.regionRadiusKm ?? '')
      setRodizio(data.rodizio.map(r => r.delivererId))
    }
  }, [data])

  const nameOf = (id: string) => deliverers.find(d => d.id === id)?.name ?? '—'
  const statusOf = (id: string) => deliverers.find(d => d.id === id)?.status ?? 'OFFLINE'
  const available = deliverers.filter(d => d.isActive && !rodizio.includes(d.id))

  // Alterar a config invalida o resultado do dry-run anterior.
  function invalidateDry() { setDry(null) }

  function move(idx: number, dir: -1 | 1) {
    const next = [...rodizio]
    const j = idx + dir
    if (j < 0 || j >= next.length) return
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setRodizio(next); invalidateDry()
  }
  function remove(id: string) { setRodizio(rodizio.filter(x => x !== id)); invalidateDry() }
  function add(id: string) { if (id && !rodizio.includes(id)) { setRodizio([...rodizio, id]); invalidateDry() } }

  function payload() {
    return {
      enabled,
      waitMinutes: waitMinutes === '' ? 1 : waitMinutes,
      queueSize: queueSize === '' ? 1 : queueSize,
      maxOrders: maxOrders === '' ? null : Number(maxOrders),
      groupByRegion,
      regionRadiusKm: regionRadiusKm === '' ? null : Number(regionRadiusKm),
      delivererIds: rodizio,
    }
  }

  async function handleDryRun() {
    setDryLoading(true)
    setError('')
    try {
      const res = await api.post<DryRunResult>('/store/auto-routes/dry-run', payload())
      setDry(res)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setDryLoading(false)
    }
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      await api.put('/store/auto-routes/config', payload())
      mutate()
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
              <Shuffle className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Rotas automáticas</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
          <p className="text-sm text-gray-500">
            Cria rotas automaticamente quando a fila de pedidos em preparação cresce, distribuindo o
            trabalho por um rodízio de entregadores.
          </p>

          {/* Toggle ativar */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Ativar rotas automáticas</p>
              <p className="text-xs text-gray-500">Distribui a fila de pedidos pelo rodízio configurado abaixo</p>
            </div>
            <button
              type="button"
              onClick={() => { setEnabled(v => !v); invalidateDry() }}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: enabled ? 'var(--color-primary)' : '#E5E7EB' }}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Gatilhos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-900">Tempo de espera</label>
              <p className="mt-0.5 mb-2 text-xs text-gray-500">Cria a rota se o pedido mais antigo esperar mais que isto</p>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={720} value={waitMinutes}
                  onChange={(e) => { setWaitMinutes(e.target.value === '' ? '' : Number(e.target.value)); invalidateDry() }}
                  onBlur={(e) => setWaitMinutes(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
                  className="w-28" />
                <span className="text-xs text-gray-500">minutos</span>
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-900">Tamanho da fila</label>
              <p className="mt-0.5 mb-2 text-xs text-gray-500">Cria a rota quando houver esta quantidade de pedidos aguardando</p>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={100} value={queueSize}
                  onChange={(e) => { setQueueSize(e.target.value === '' ? '' : Number(e.target.value)); invalidateDry() }}
                  onBlur={(e) => setQueueSize(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                  className="w-28" />
                <span className="text-xs text-gray-500">pedidos</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <label className="block text-sm font-medium text-gray-900">Máximo de pedidos por rota (opcional)</label>
            <p className="mt-0.5 mb-2 text-xs text-gray-500">Deixe vazio para incluir todos os pedidos que estavam em preparação</p>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} max={100} value={maxOrders} placeholder="Todos"
                onChange={(e) => { setMaxOrders(e.target.value === '' ? '' : Math.max(1, Math.min(100, Number(e.target.value) || 0))); invalidateDry() }}
                className="w-28" />
              <span className="text-xs text-gray-500">pedidos</span>
            </div>
          </div>

          {/* Agrupar por região */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Agrupar por região</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Em vez de 1 rota com todos os pedidos, cria uma rota por grupo de pedidos próximos
                  entre si (dentro do raio), cada uma para um entregador diferente do rodízio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setGroupByRegion(v => !v); invalidateDry() }}
                className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
                style={{ background: groupByRegion ? 'var(--color-primary)' : '#E5E7EB' }}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${groupByRegion ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {groupByRegion && (
              <div className="mt-3 flex items-center gap-2">
                <Input type="number" min={0.1} max={50} step={0.1} value={regionRadiusKm}
                  onChange={(e) => { setRegionRadiusKm(e.target.value === '' ? '' : Math.max(0.1, Math.min(50, Number(e.target.value) || 0))); invalidateDry() }}
                  className="w-28" />
                <span className="text-xs text-gray-500">km de raio</span>
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Pedidos próximos entre si entram na mesma rota, mesmo que a cadeia toda não caiba num
              único ponto. Pedidos sem localização cadastrada sempre viram uma rota própria.
            </p>
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
                    <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => move(idx, 1)} disabled={idx === rodizio.length - 1} className="rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => remove(id)} className="rounded p-1 text-gray-400 hover:text-red-600" aria-label="Remover"><X className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}

            {available.length > 0 && (
              <div className="mt-3">
                <select
                  value=""
                  onChange={(e) => { add(e.target.value); e.target.value = '' }}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                >
                  <option value="" disabled>Adicionar entregador…</option>
                  {available.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                </select>
              </div>
            )}
          </div>

          {/* Dry-run */}
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Simulação (dry-run)</p>
                <p className="text-xs text-gray-500">Veja o que aconteceria agora com esta configuração — sem criar nada.</p>
              </div>
              <Button variant="outline" onClick={handleDryRun} disabled={dryLoading}>
                {dryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                Simular
              </Button>
            </div>

            {dry && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600 ring-1 ring-gray-200">
                    {dry.preparingCount} em preparação
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 font-medium text-gray-600 ring-1 ring-gray-200">
                    espera máx. {dry.maxWaitMinutes} min
                  </span>
                </div>

                {!dry.wouldTrigger ? (
                  <div className="flex items-start gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-gray-600 ring-1 ring-gray-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <span>Nada seria criado agora — a fila ainda não atingiu {queueSize} pedidos nem {waitMinutes} min de espera.</span>
                  </div>
                ) : dry.groups.length === 0 ? (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700 ring-1 ring-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>O gatilho seria atingido, mas não há entregadores no rodízio — nenhuma rota seria criada.</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dry.groups.map((g, i) => (
                      <div key={i} className="space-y-2">
                        {g.noEligibleDeliverer ? (
                          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-700 ring-1 ring-amber-200">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>
                              {dry.groups.length > 1 ? `Grupo ${i + 1}: ` : ''}
                              nenhum entregador do rodízio está disponível agora (precisa estar online e sem
                              rota ativa) — aguardará a próxima verificação.
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-800 ring-1 ring-green-200">
                            <Crown className="h-4 w-4 shrink-0 text-amber-500" />
                            <span>
                              Seria criada <strong>rota{dry.groups.length > 1 ? ` ${i + 1}` : ''}</strong> para{' '}
                              <strong>{g.delivererName}</strong> com{' '}
                              <strong>{g.orders.length} pedido{g.orders.length !== 1 ? 's' : ''}</strong>.
                            </span>
                          </div>
                        )}
                        {g.orders.length > 0 && (
                          <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg bg-white ring-1 ring-gray-200">
                            {g.orders.map(o => (
                              <li key={o.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                                {o.isPriority && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                                <span className="font-mono font-semibold text-gray-700">{o.shortId}</span>
                                <span className="truncate text-gray-600">{o.customerName}</span>
                                <span className="ml-auto shrink-0 text-gray-400">{o.waitMinutes} min</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {g.overflowCount > 0 && (
                          <p className="text-xs text-gray-500">
                            +{g.overflowCount} pedido{g.overflowCount !== 1 ? 's' : ''} deste grupo ficaria{g.overflowCount !== 1 ? 'm' : ''} para o próximo gatilho (limite por rota).
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <Button onClick={handleSave} disabled={loading}>
            <Save className="h-4 w-4" />
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
