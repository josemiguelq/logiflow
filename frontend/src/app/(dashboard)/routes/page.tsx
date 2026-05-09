'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { Download, Eye, Loader2 } from 'lucide-react'
import { DeliveryRoute, RouteStatus } from '@/types'
import { api } from '@/lib/api'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'

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

function escapeCsv(val: string): string {
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

export default function RoutesPage() {
  const { data: routes = [], isLoading } = useSWR<DeliveryRoute[]>(
    '/routes',
    (url: string) => api.get<DeliveryRoute[]>(url)
  )
  const features     = useStoreFeatures()
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const rows = await api.get<ExportRow[]>('/routes/export')
      const csv  = buildCsv(rows)
      const date = new Date().toISOString().slice(0, 10)
      downloadCsv(csv, `rotas-${date}.csv`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rotas</h1>
          <p className="text-sm text-gray-500 mt-1">Rotas de entrega criadas pelos entregadores</p>
        </div>
        {features.csvExportEnabled && (
          <button
            onClick={handleExport}
            disabled={exporting || routes.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {exporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            Baixar CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
            style={{ borderTopColor: 'var(--color-primary)' }} />
        </div>
      ) : routes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <p className="text-lg font-medium">Nenhuma rota ainda</p>
          <p className="text-sm mt-1">Rotas aparecem quando pedidos são atribuídos em lote</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
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
                    <Link
                      href={`/routes/${route.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
