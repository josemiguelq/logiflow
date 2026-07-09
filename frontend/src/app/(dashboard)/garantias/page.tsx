'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Plus, Search, X, Loader2, Copy, Check, FileText, QrCode, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { Pagination } from '@/components/ui/pagination'
import { PagedWarranties, WarrantyClientListItem, CreateWarrantyResponse, Customer, WarrantyConfig } from '@/types'
import { DetailDrawer } from './_detail_drawer'

const fetcher = (url: string) => api.get<PagedWarranties>(url)

const STATUS_STYLE: Record<WarrantyClientListItem['status'], { label: string; cls: string }> = {
  confirmed: { label: 'Confirmado',    cls: 'bg-green-50 text-green-700' },
  pending:   { label: 'Pendente',      cls: 'bg-yellow-50 text-yellow-700' },
  outdated:  { label: 'Desatualizado', cls: 'bg-orange-50 text-orange-700' },
}

export default function GarantiasPage() {
  const router = useRouter()
  const { can, isLoading: accessLoading } = useAccess()
  const allowed = can({ scope: 'warranties:view', feature: 'warranties' })

  useEffect(() => {
    if (accessLoading) return
    if (!allowed) router.replace('/orders')
  }, [accessLoading, allowed, router])

  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('')
  const [page,     setPage]     = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [created,   setCreated]   = useState<CreateWarrantyResponse | null>(null)
  const [copied,    setCopied]    = useState(false)

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [qrItem, setQrItem] = useState<{ qrDataUrl: string; publicUrl: string } | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  const [configOpen, setConfigOpen] = useState(false)
  const [configData, setConfigData] = useState<WarrantyConfig | null>(null)
  const [configVideoUrl, setConfigVideoUrl] = useState('')
  const [configQuestions, setConfigQuestions] = useState<{ id: string; label: string; required: boolean }[]>([])
  const [savingConfig, setSavingConfig] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => { setPage(1) }, [search, status])

  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('customerName', search)
  if (status) params.set('status', status)

  const { data, mutate } = useSWR(`/garantias?${params}`, fetcher, { keepPreviousData: true })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const hasFilters = !!(search || status)

  function clearFilters() {
    setSearch('')
    setStatus('')
  }

  function openModal() {
    setCustomerSearch('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setCreated(null)
    setCopied(false)
    setModalOpen(true)
  }

  async function searchCustomers(q: string) {
    setCustomerSearch(q)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    setSearchingCustomer(true)
    try {
      const data = await api.get<{ items: Customer[] }>(`/customers?search=${encodeURIComponent(q.trim())}`)
      setCustomerResults(data.items)
    } finally {
      setSearchingCustomer(false)
    }
  }

  function pickCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerSearch(c.name)
    setCustomerResults([])
  }

  async function handleSubmit() {
    if (!selectedCustomer) return
    setSubmitting(true)
    try {
      const result = await api.post<CreateWarrantyResponse>('/garantias', {
        customerId: selectedCustomer.id,
      })
      setCreated(result)
      mutate()
    } finally {
      setSubmitting(false)
    }
  }

  async function openConfig() {
    const config = await api.get<WarrantyConfig>('/garantias/config')
    setConfigData(config)
    setConfigVideoUrl(config.videoUrl ?? '')
    setConfigQuestions(config.questions)
    setPublishConfirm(false)
    setConfigOpen(true)
  }

  async function saveDraft() {
    setSavingConfig(true)
    try {
      await api.put('/garantias/config', {
        videoUrl: configVideoUrl || null,
        questions: configQuestions,
      })
      await openConfig()
    } finally {
      setSavingConfig(false)
    }
  }

  async function publishVersion() {
    setPublishing(true)
    try {
      // Salva o rascunho e publica a nova versão.
      await api.put('/garantias/config', {
        videoUrl: configVideoUrl || null,
        questions: configQuestions,
      })
      await api.post('/garantias/config/publish', {})
      setPublishConfirm(false)
      await openConfig()
      mutate()
    } finally {
      setPublishing(false)
    }
  }

  async function copyLink() {
    if (!created) return
    await navigator.clipboard.writeText(created.shortLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (accessLoading || !allowed) return null

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Garantias</h1>
          <p className="text-sm text-gray-500">{total} cliente{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openConfig}
            className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Ver termos de garantia
          </button>
          <button
            onClick={openModal}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
            style={{ background: 'var(--color-primary)' }}
          >
            <Plus className="h-4 w-4" />
            Gerar link do cliente
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome do cliente..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
          />
        </div>

        <div className="flex flex-col">
          <label className="mb-0.5 text-[11px] font-medium text-gray-400">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
          >
            <option value="">Todos</option>
            <option value="confirmed">Confirmado</option>
            <option value="pending">Pendente</option>
            <option value="outdated">Desatualizado</option>
          </select>
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex h-9 items-center gap-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <p className="font-medium">Nenhuma garantia encontrada</p>
            <p className="mt-1 text-sm">Ajuste os filtros para ver mais resultados</p>
          </div>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs font-medium text-gray-500">
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Versão aceita</th>
                <th className="px-4 py-3 text-left">Versão atual</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Última confirmação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr
                  key={item.customerId}
                  className="transition-colors hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCustomerId(item.customerId)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{item.customerName}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.lastConfirmedVersion != null ? `v${item.lastConfirmedVersion}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {item.currentVersion != null ? `v${item.currentVersion}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[item.status].cls}`}
                    >
                      {STATUS_STYLE[item.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {item.lastConfirmedAt ? new Date(item.lastConfirmedAt).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={e => { e.stopPropagation(); setSelectedCustomerId(item.customerId) }}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Detalhes"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        onClick={async e => {
                          e.stopPropagation()
                          setQrLoading(true)
                          try {
                            const res = await api.get<{ qrDataUrl: string; publicUrl: string }>(`/garantias/${item.customerId}/qrcode`)
                            setQrItem(res)
                          } finally {
                            setQrLoading(false)
                          }
                        }}
                        className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        title="QR Code"
                      >
                        <QrCode className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pages={pages} onChange={setPage} />

      {/* Create / Link Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {created ? (
              <>
                <h2 className="mb-4 text-lg font-bold text-gray-900">Link gerado!</h2>
                <div className="flex justify-center mb-4">
                  <img src={created.qrDataUrl} alt="QR Code" className="h-48 w-48" />
                </div>
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <span className="flex-1 truncate">{created.shortLink}</span>
                  <button
                    onClick={copyLink}
                    className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="w-full rounded-lg py-2 text-sm font-medium text-white transition-colors"
                  style={{ background: 'var(--color-primary)' }}
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-lg font-bold text-gray-900">Gerar link do cliente</h2>
                <p className="mb-4 text-sm text-gray-500">
                  O cliente assina os termos uma única vez. O mesmo link é reutilizado; se os termos mudarem, o cliente assina a nova versão.
                </p>
                <div className="space-y-4">
                  <div className="relative">
                    <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={e => searchCustomers(e.target.value)}
                        onFocus={() => { if (selectedCustomer) { setCustomerResults([]); setSelectedCustomer(null); setCustomerSearch('') } }}
                        placeholder="Buscar cliente por nome..."
                        className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                      />
                      {searchingCustomer && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                      )}
                    </div>
                    {customerResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                        {customerResults.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => pickCustomer(c)}
                            className="w-full px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="ml-2 text-xs text-gray-400">{c.phone}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedCustomer && (
                      <p className="mt-1 text-xs text-green-600">
                        {selectedCustomer.name} selecionado
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setModalOpen(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !selectedCustomer}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {submitting ? 'Gerando…' : 'Gerar link'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-bold text-gray-900">QR Code da Garantia</h2>
            <div className="flex justify-center mb-4">
              <img src={qrItem.qrDataUrl} alt="QR Code" className="h-48 w-48" />
            </div>
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <span className="flex-1 truncate">{qrItem.publicUrl}</span>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(qrItem.publicUrl)
                  const btn = document.activeElement
                  if (btn) {
                    const orig = btn.textContent
                    btn.textContent = 'Copiado!'
                    setTimeout(() => { btn.textContent = orig }, 2000)
                  }
                }}
                className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setQrItem(null)}
              className="w-full rounded-lg py-2 text-sm font-medium text-white transition-colors"
              style={{ background: 'var(--color-primary)' }}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Terms Config Modal */}
      {configOpen && configData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Termos de Garantia</h2>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {configData.currentVersion != null ? `Versão atual: v${configData.currentVersion}` : 'Nenhuma versão publicada'}
              </span>
            </div>
            {configData.currentPublishedAt && (
              <p className="-mt-2 mb-4 text-xs text-gray-400">
                Publicada em {new Date(configData.currentPublishedAt).toLocaleString('pt-BR')}
              </p>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">URL do Vídeo</label>
                <input
                  type="url"
                  value={configVideoUrl}
                  onChange={e => setConfigVideoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                />
                <p className="mt-1 text-xs text-gray-400">Vídeo curto (~20s) sobre cuidados com as peças</p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Perguntas</label>
                <div className="space-y-2">
                  {configQuestions.map((q, idx) => (
                    <div key={q.id} className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={e => {
                            setConfigQuestions(prev => prev.map((x, i) =>
                              i === idx ? { ...x, required: e.target.checked } : x
                            ))
                          }}
                          className="mt-1 h-4 w-4 rounded border-gray-300 accent-gray-900"
                        />
                        <div className="flex-1">
                          <input
                            type="text"
                            value={q.label}
                            onChange={e => {
                              setConfigQuestions(prev => prev.map((x, i) =>
                                i === idx ? { ...x, label: e.target.value } : x
                              ))
                            }}
                            className="w-full rounded border-0 bg-transparent px-0 py-0 text-sm text-gray-700 focus:outline-none focus:ring-0"
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-gray-400 ml-6">
                        {q.required ? 'Obrigatória' : 'Opcional'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Publish warning / confirm */}
            {publishConfirm ? (
              <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-500" />
                  <div className="text-sm text-orange-800">
                    <p className="font-medium">Publicar nova versão?</p>
                    <p className="mt-1 text-xs">
                      Todos os clientes que já assinaram passarão a aparecer como <strong>Desatualizados</strong> e precisarão assinar novamente esta nova versão. A ação não pode ser desfeita.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setPublishConfirm(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={publishVersion}
                    disabled={publishing}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {publishing ? 'Publicando…' : 'Confirmar publicação'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-2">
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfigOpen(false)}
                    className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    onClick={saveDraft}
                    disabled={savingConfig}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {savingConfig ? 'Salvando…' : 'Salvar rascunho'}
                  </button>
                </div>
                <button
                  onClick={() => setPublishConfirm(true)}
                  className="w-full rounded-lg border border-orange-300 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 transition-colors"
                >
                  Publicar nova versão
                </button>
                {configData.draftDirty && (
                  <p className="text-center text-xs text-orange-500">
                    O rascunho tem alterações não publicadas.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedCustomerId && (
        <DetailDrawer
          customerId={selectedCustomerId}
          onClose={() => setSelectedCustomerId(null)}
        />
      )}
    </div>
  )
}
