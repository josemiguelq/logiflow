'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, Search, MapPin, Phone, Pencil, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react'
import { Customer } from '@/types'
import { api } from '@/lib/api'
import { formatPhone } from '@/lib/phone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccess } from '@/hooks/useAccess'

interface PagedCustomers { items: Customer[]; total: number; page: number; pages: number }

const fetcher = (url: string) => api.get<PagedCustomers>(url)

interface DeleteModalProps {
  count: number
  customerName?: string
  loading: boolean
  onConfirm: () => void
  onClose: () => void
}

function DeleteModal({ count, customerName, loading, onConfirm, onClose }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Trash2 className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Excluir {count > 1 ? `${count} clientes` : 'cliente'}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {count > 1
                ? `Os ${count} clientes selecionados serão excluídos permanentemente.`
                : <>O cliente <span className="font-medium">{customerName}</span> será excluído permanentemente.</>
              }
              {' '}Esta ação não pode ser desfeita.
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

export default function CustomersPage() {
  const [search, setSearch] = useState('')
  const [page,   setPage]   = useState(1)
  const { can } = useAccess()
  const canDelete = can({ scope: 'customers:delete' })

  // Batch selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Delete state
  const [deletingOne,   setDeletingOne]   = useState<Customer | null>(null)
  const [deletingBatch, setDeletingBatch] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => { setPage(1) }, [search])
  // Clear selection on page/search change
  useEffect(() => { setSelected(new Set()) }, [page, search])

  const params = new URLSearchParams({ page: String(page) })
  if (search) params.set('search', search)
  const { data, mutate } = useSWR(`/customers?${params}`, fetcher)

  const customers = data?.items ?? []
  const total     = data?.total ?? 0
  const pages     = data?.pages ?? 1

  const allSelected  = customers.length > 0 && customers.every(c => selected.has(c.id))
  const someSelected = selected.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        customers.forEach(c => next.delete(c.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        customers.forEach(c => next.add(c.id))
        return next
      })
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function confirmDeleteOne() {
    if (!deletingOne) return
    setDeleteLoading(true)
    try {
      await api.delete(`/customers/${deletingOne.id}`)
      setDeletingOne(null)
      setSelected(prev => { const n = new Set(prev); n.delete(deletingOne.id); return n })
      mutate()
    } finally {
      setDeleteLoading(false)
    }
  }

  async function confirmDeleteBatch() {
    setDeleteLoading(true)
    try {
      await api.deleteWithBody('/customers', { ids: [...selected] })
      setSelected(new Set())
      setDeletingBatch(false)
      mutate()
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className={`p-4 sm:p-6${someSelected ? ' pb-24' : ''}`}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">{total} cliente{total !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/customers/new">
          <Button>
            <Plus className="h-4 w-4" />
            Novo Cliente
          </Button>
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {customers.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <p className="font-medium">Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                {canDelete && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Telefone</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Endereços</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => {
                const primary   = c.addresses.find(a => a.isDefault) ?? c.addresses[0]
                const isSelected = selected.has(c.id)
                return (
                  <tr key={c.id} className={`transition-colors ${isSelected ? 'bg-red-50/40' : 'hover:bg-gray-50'}`}>
                    {canDelete && (
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c.id)}
                          className="h-4 w-4 rounded border-gray-300 accent-gray-900 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-gray-400" />
                        {formatPhone(c.phone)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span className="max-w-xs truncate">{primary?.address ?? ''}</span>
                        {c.addresses.length > 1 && (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            +{c.addresses.length - 1}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/customers/${c.id}/edit`}
                          className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        {canDelete && (
                          <button
                            onClick={() => setDeletingOne(c)}
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

      {/* Batch delete sticky bar */}
      {canDelete && someSelected && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-2xl md:left-64">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <span className="flex-1 text-sm font-medium text-gray-700">
              {selected.size} cliente{selected.size !== 1 ? 's' : ''} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              Limpar seleção
            </button>
            <button
              onClick={() => setDeletingBatch(true)}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Excluir {selected.size}
            </button>
          </div>
        </div>
      )}

      {deletingOne && (
        <DeleteModal
          count={1}
          customerName={deletingOne.name}
          loading={deleteLoading}
          onConfirm={confirmDeleteOne}
          onClose={() => setDeletingOne(null)}
        />
      )}

      {deletingBatch && (
        <DeleteModal
          count={selected.size}
          loading={deleteLoading}
          onConfirm={confirmDeleteBatch}
          onClose={() => setDeletingBatch(false)}
        />
      )}
    </div>
  )
}
