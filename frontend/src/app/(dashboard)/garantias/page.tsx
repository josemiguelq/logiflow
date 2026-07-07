'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Plus, Search, X, Loader2, ChevronDown, Minus, Copy, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { Pagination } from '@/components/ui/pagination'
import { PagedWarranties, CreateWarrantyResponse } from '@/types'
import { DetailDrawer } from './_detail_drawer'

const fetcher = (url: string) => api.get<PagedWarranties>(url)

export default function GarantiasPage() {
  const [search,   setSearch]   = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [page,     setPage]     = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [formName,  setFormName]  = useState('')
  const [formParts, setFormParts] = useState<string[]>([''])
  const [formSaleAt, setFormSaleAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [created,   setCreated]   = useState<CreateWarrantyResponse | null>(null)
  const [copied,    setCopied]    = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)

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
    setFormName('')
    setFormParts([''])
    setFormSaleAt(new Date().toISOString().slice(0, 16))
    setCreated(null)
    setCopied(false)
    setModalOpen(true)
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
    if (!formName.trim() || formParts.every(p => !p.trim())) return
    setSubmitting(true)
    try {
      const result = await api.post<CreateWarrantyResponse>('/garantias', {
        customerName: formName.trim(),
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

  const now = new Date().toISOString().slice(0, 16)

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Garantias</h1>
          <p className="text-sm text-gray-500">{total} registro{total !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
          style={{ background: 'var(--color-primary)' }}
        >
          <Plus className="h-4 w-4" />
          Nova Garantia
        </button>
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
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nome do Cliente</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="Nome do cliente"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
                    />
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
                    disabled={submitting || !formName.trim() || formParts.every(p => !p.trim())}
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
