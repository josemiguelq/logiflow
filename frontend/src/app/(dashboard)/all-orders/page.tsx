'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Search, ChevronDown, X, Crown, AlertTriangle } from 'lucide-react'
import { Order, OrderStatus } from '@/types'
import { api } from '@/lib/api'
import { StatusBadge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { TableSkeleton, type TableSkeletonColumn } from '@/components/ui/table-skeleton'
import { STATUS_LABELS, formatDate } from '@/lib/utils'

interface PagedOrders { items: Order[]; total: number; page: number; pages: number }

const fetcher = (url: string) => api.get<PagedOrders>(url)

const STATUSES: OrderStatus[] = [
  'PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED',
]

// Colunas do shimmer — mesma ordem e classes responsivas dos headers da tabela.
const SKELETON_COLS: TableSkeletonColumn[] = [
  { bar: 'w-24' },                                // Pedido
  { bar: 'w-28' },                                // Cliente
  { cell: 'hidden sm:table-cell', bar: 'w-40' },  // Endereço
  { cell: 'hidden md:table-cell', bar: 'w-24' },  // Entregador
  { bar: 'w-16' },                                // Status
  { bar: 'w-20' },                                // Data
  { cell: 'text-right', bar: 'w-10' },            // Ações
]

function paymentDiscrepancy(order: Order): { collected: number; expected: number } | null {
  if (!order.cashAmount || order.cashAmount <= 0) return null
  const collected = order.payments?.reduce((s, p) => s + p.amount, 0) ?? 0
  if (collected >= order.cashAmount) return null
  return { collected, expected: order.cashAmount }
}

export default function AllOrdersPage() {
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState<OrderStatus | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')
  const [page,     setPage]     = useState(1)

  // Reset to first page whenever a filter changes
  useEffect(() => { setPage(1) }, [search, status, dateFrom, dateTo])

  const params = new URLSearchParams({ page: String(page) })
  if (search)   params.set('customerName', search)
  if (status)   params.set('status', status)
  if (dateFrom) params.set('dateFrom', dateFrom)
  if (dateTo)   params.set('dateTo', dateTo)

  const { data, isLoading } = useSWR(`/orders/search?${params}`, fetcher, { keepPreviousData: true })

  const orders = data?.items ?? []
  const total  = data?.total ?? 0
  const pages  = data?.pages ?? 1

  const hasFilters = !!(search || status || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
          <p className="text-sm text-gray-500">{total} pedido{total !== 1 ? 's' : ''}</p>
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

        <div className="relative">
          <select
            value={status}
            onChange={e => setStatus(e.target.value as OrderStatus | '')}
            className="h-9 w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 sm:w-auto"
            style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
          >
            <option value="">Todos os status</option>
            {STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr className="text-xs font-medium text-gray-500">
                <th className="px-4 py-3 text-left">Pedido</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="hidden sm:table-cell px-4 py-3 text-left">Endereço</th>
                <th className="hidden md:table-cell px-4 py-3 text-left">Entregador</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Data</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <TableSkeleton columns={SKELETON_COLS} />
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12">
                    <div className="flex flex-col items-center text-gray-400">
                      <p className="font-medium">Nenhum pedido encontrado</p>
                      <p className="mt-1 text-sm">Ajuste os filtros para ver mais resultados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map(order => (
                <tr key={order.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">
                    <span className="inline-flex items-center gap-1.5">
                      {order.isPriority && (
                        <Crown
                          className="h-3.5 w-3.5 shrink-0 text-amber-500"
                          fill="currentColor"
                          aria-label="Pedido prioritário"
                        />
                      )}
                      <Link
                      href={`/orders/${order.id}`}
                      className="font-mono text-xs font-semibold text-gray-700">
                        #{order.id.slice(-8).toUpperCase()}
                        </Link>
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{order.customer.name}</td>
                  <td className="hidden sm:table-cell px-4 py-3 max-w-[220px]">
                    <span className="block truncate text-gray-500">{order.customer.address}</span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-500">
                    {order.deliverer?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {paymentDiscrepancy(order) && (
                        <span
                          className="inline-flex"
                          title={`Valor recebido (${paymentDiscrepancy(order)!.collected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) menor que o esperado (${paymentDiscrepancy(order)!.expected.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                      <Link
                        href={`/orders/${order.id}`}
                        className="text-xs font-medium hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        Ver
                      </Link>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
      </div>

      <Pagination page={page} pages={pages} onChange={setPage} />
    </div>
  )
}
