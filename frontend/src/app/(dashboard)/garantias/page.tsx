'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, Search, X, Loader2, Minus, Copy, Check, FileText } from 'lucide-react'
import { api } from '@/lib/api'
import { Pagination } from '@/components/ui/pagination'
import { PagedWarranties, CreateWarrantyResponse, Customer, WarrantyConfig } from '@/types'
import { DetailDrawer } from './_detail_drawer'

const fetcher = (url: string) => api.get<PagedWarranties>(url)

export default function GarantiasPage() {
  const [search,   setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [page,     setPage]     = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [searchingCustomer, setSearchingCustomer] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [formParts, setFormParts] = useState<string[]>([''])
  const [formSaleAt, setFormSaleAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created,   setCreated]   = useState<CreateWarrantyResponse | null>(null)
  const [copied,    setCopied]    = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [configOpen, setConfigOpen] = useState(false)
  const [configData, setConfigData] = useState<WarrantyConfig | null>(null)
  const [configVideoUrl, setConfigVideoUrl] = useState('')
  const [configQuestions, setConfigQuestions] = useState<{ id: string; label: string; required: boolean }[]>([])
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => { setPage(1) }, [search, dateFrom, dateTo])

  const params = new URLSearchParams({ page: String(page) })
  if (search)   params.set('customerName', search)
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo)   params.set('dateTo', dateTo)

  const { data, mutate } = useSWR(`/garantias?${params}`, fetcher, { keepPreviousData: true })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const pages = data?.pages ?? 1
  const hasFilters = !!(search || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  function openModal() {
    setCustomerSearch('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setFormParts([''])
    setFormSaleAt(new Date().toISOString().slice(0, 16))
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

  function addPartField() {
    setFormParts(prev => [...prev, ''])
  }

  function removePartField(idx: number) {
    setFormParts(prev => prev.filter((_, i) => i !== idx))
  }

  function updatePart(idx: number, value: string) {
    setFormParts(prev => prev.map((p, i) => i === idx ? value : p))
  }

  async function handleSubmit() {
    if (!selectedCustomer || formParts.every(p => !p.trim())) return
    setSubmitting(true)
    try {
      const result = await api.post<CreateWarrantyResponse>('/garantias', {
        customerId: selectedCustomer.id,
        parts: formParts.filter(p => p.trim()),
        saleAt: formSaleAt ? new Date(formSaleAt).toISOString() : undefined,
      })
      setCreated(result)
      mutate()
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!created) return
    await navigator.clipboard.writeText(created.shortLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Garantias</h1>
          <p className="text-sm text-gray-500">{total} registro{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const config = await api.get<WarrantyConfig>('/garantias/config')
              setConfigData(config)
              setConfigVideoUrl(config.videoUrl ?? '')
              setConfigQuestions(config.questions)
              setConfigOpen(true)
            }}
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
            Nova Garantia
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

        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <label className="mb-0.5 text-[11px] font-medium text-gray-400">De</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>
          <div className="flex flex-col">
            <label className="mb-0.5 text-[11px] font-medium text-gray-400">Até</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>
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
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs font-medium text-gray-500">
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Peças</th>
                <th className="px-4 py-3 text-left">Data da Venda</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Criado por</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedId(item.id)}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{item.customerName}</td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <span className="block truncate text-gray-500">
                      {item.parts.join(', ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(item.saleAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        item.status === 'confirmed'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-yellow-50 text-yellow-700'
                      }`}
                    >
                      {item.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {item.createdByName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      Detalhes
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination page={page} pages={pages} onChange={setPage} />

      {/* Create Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            {created ? (
              <>
                <h2 className="mb-4 text-lg font-bold text-gray-900">Garantia criada!</h2>
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
                <h2 className="mb-4 text-lg font-bold text-gray-900">Nova Garantia</h2>
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

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Peças</label>
                    <div className="space-y-2">
                      {formParts.map((part, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={part}
                            onChange={e => updatePart(idx, e.target.value)}
                            placeholder={`Peça ${idx + 1}`}
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                          />
                          {formParts.length > 1 && (
                            <button
                              onClick={() => removePartField(idx)}
                              className="rounded-md p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Minus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={addPartField}
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        + Adicionar peça
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Data/Hora da Venda</label>
                    <input
                      type="datetime-local"
                      value={formSaleAt}
                      onChange={e => setFormSaleAt(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                    />
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
                    disabled={submitting || !selectedCustomer || formParts.every(p => !p.trim())}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {submitting ? 'Salvando…' : 'Salvar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Terms Config Modal */}
      {configOpen && configData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="mb-4 text-lg font-bold text-gray-900">Termos de Garantia</h2>
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

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setConfigOpen(false)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setSavingConfig(true)
                  try {
                    await api.put('/garantias/config', {
                      videoUrl: configVideoUrl || null,
                      questions: configQuestions,
                    })
                    setConfigOpen(false)
                  } finally {
                    setSavingConfig(false)
                  }
                }}
                disabled={savingConfig}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-40 transition-colors"
                style={{ background: 'var(--color-primary)' }}
              >
                {savingConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {savingConfig ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Drawer */}
      {selectedId && (
        <DetailDrawer
          id={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}
