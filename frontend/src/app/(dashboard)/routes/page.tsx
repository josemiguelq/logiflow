'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Download, Eye, Loader2, X, Calendar, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { DeliveryRoute, RouteStatus } from '@/types'
import { api } from '@/lib/api'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'
import { useAccess } from '@/hooks/useAccess'

const STATUS_LABEL: Record<RouteStatus, string> = {
  CREATED:  'Criada',
  STARTED:  'Em andamento',
  FINISHED: 'Finalizada',
}

const STATUS_COLOR: Record<RouteStatus, string> = {
  CREATED:  'bg-blue-100 text-blue-700',
  STARTED:  'bg-orange-100 text-orange-700',
  FINISHED: 'bg-green-100 text-green-700',
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  PREPARING:        'Aguardando',
  ASSIGNED:         'Atribuído',
  ON_ROUTE:         'Em rota',
  OUT_FOR_DELIVERY: 'Saiu p/ entrega',
  DELIVERED:        'Entregue',
  CANCELLED:        'Cancelado',
}

interface ExportRow {
  orderId:         string
  routeId:         string
  delivererName:   string
  deliveryAddress: string
  status:          string
  createdAt:       string | null
  pickedUpAt:      string | null
  deliveredAt:     string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function shortId(uuid: string): string {
  return `#${uuid.slice(-8).toUpperCase()}`
}

function escapeCsv(val: string | null | undefined): string {
  if (val == null) return ''
  if (val.includes('"') || val.includes(',') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function buildCsv(rows: ExportRow[]): string {
  const headers = [
    'ID do Pedido', 'ID da Rota', 'Entregador',
    'Endereço de Entrega', 'Status',
    'Criado em', 'Retirado em', 'Entregue em',
  ]
  const lines = [headers.map(escapeCsv).join(',')]
  for (const r of rows) {
    lines.push([
      shortId(r.orderId),
      shortId(r.routeId),
      r.delivererName,
      r.deliveryAddress,
      ORDER_STATUS_LABEL[r.status] ?? r.status,
      fmtDate(r.createdAt),
      fmtDate(r.pickedUpAt),
      fmtDate(r.deliveredAt),
    ].map(escapeCsv).join(','))
  }
  return lines.join('\r\n')
}

function downloadCsv(content: string, filename: string) {
  const bom = '﻿'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function thirtyDaysAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

interface ExportModalProps {
  onClose: () => void
}

function ExportModal({ onClose }: ExportModalProps) {
  const [from, setFrom] = useState(thirtyDaysAgoStr())
  const [to,   setTo]   = useState(todayStr())
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to })
      const rows = await api.get<ExportRow[]>(`/routes/export?${params}`)
      const csv  = buildCsv(rows)
      downloadCsv(csv, `rotas-${from}-${to}.csv`)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-500" />
            <h2 className="text-base font-semibold text-gray-900">Exportar CSV</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-sm text-gray-500">
          Selecione o período das rotas que deseja exportar.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">De</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={e => setFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Até</label>
            <input
              type="date"
              value={to}
              min={from}
              max={todayStr()}
              onChange={e => setTo(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={loading || !from || !to}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            {loading ? 'Exportando…' : 'Baixar CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PagedRoutes { items: DeliveryRoute[]; total: number; page: number; pages: number }

interface DeleteRouteModalProps {
  route: DeliveryRoute
  onClose: () => void
  onDeleted: () => void
}

function DeleteRouteModal({ route, onClose, onDeleted }: DeleteRouteModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  async function handleDelete() {
    setLoading(true)
    setError('')
    try {
      await api.delete(`/routes/${route.id}`)
      onDeleted()
    } catch (err: unknown) {
      setError((err as Error).message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Excluir rota</h2>
            <p className="mt-1 text-sm text-gray-500">
              Esta ação irá excluir permanentemente a rota{' '}
              <span className="font-mono font-bold">{route.pickupCode}</span> e todos os{' '}
              <span className="font-semibold text-red-700">{route.orderCount} pedido{route.orderCount !== 1 ? 's' : ''}</span>{' '}
              associados a ela. Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
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

export default function RoutesPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading, mutate } = useSWR<PagedRoutes>(
    `/routes?page=${page}`,
    (url: string) => api.get<PagedRoutes>(url)
  )
  const routes   = data?.items ?? []
  const total    = data?.total ?? 0
  const pages    = data?.pages ?? 1
  const features = useStoreFeatures()
  const { can }  = useAccess()
  const [showExportModal, setShowExportModal] = useState(false)
  const [deletingRoute, setDeletingRoute]     = useState<DeliveryRoute | null>(null)

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rotas</h1>
          <p className="text-sm text-gray-500 mt-1">{total} rota{total !== 1 ? 's' : ''} no total</p>
        </div>
        {features.csvExportEnabled && can({ scope: 'routes:export' }) && (
          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Baixar CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
            style={{ borderTopColor: 'var(--color-primary)' }} />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg font-medium">Nenhuma rota ainda</p>
          <p className="text-sm mt-1">Rotas aparecem quando pedidos são atribuídos em lote</p>
        </div>
      ) : (
        <>
        {/* Mobile cards */}
        <div className="space-y-3 md:hidden">
          {routes.map((route) => (
            <div key={route.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-lg font-bold tracking-widest text-gray-900">
                      {route.pickupCode}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[route.status]}`}>
                      {STATUS_LABEL[route.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-gray-700">{route.deliverer.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {route.orderCount} pedido{route.orderCount !== 1 ? 's' : ''} ·{' '}
                    {new Date(route.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    href={`/routes/${route.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Ver
                  </Link>
                  {can({ scope: 'routes:delete' }) && (
                    <button
                      onClick={() => setDeletingRoute(route)}
                      className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Código de retirada</th>
                <th className="px-4 py-3">Entregador</th>
                <th className="px-4 py-3">Pedidos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criada em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {routes.map((route) => (
                <tr key={route.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold tracking-widest text-gray-800">
                      {route.pickupCode}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {route.deliverer.name}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {route.orderCount} pedido{route.orderCount !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[route.status]}`}>
                      {STATUS_LABEL[route.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(route.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/routes/${route.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver detalhes
                      </Link>
                      {can({ scope: 'routes:delete' }) && (
                        <button
                          onClick={() => setDeletingRoute(route)}
                          className="rounded-lg p-1.5 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Excluir rota"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>Página {page} de {pages}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </button>
              <button
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors"
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        </>
      )}

      {showExportModal && (
        <ExportModal onClose={() => setShowExportModal(false)} />
      )}

      {deletingRoute && (
        <DeleteRouteModal
          route={deletingRoute}
          onClose={() => setDeletingRoute(null)}
          onDeleted={() => { setDeletingRoute(null); mutate() }}
        />
      )}
    </div>
  )
}
