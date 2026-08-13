'use client'

import { use, useEffect } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, MapPin, Phone, History, Plus, Pencil as Edit2, Trash2, ShieldCheck, Building2 } from 'lucide-react'
import { Customer, CustomerAuditEntry, WarrantyClientDetail, fullAddress, OrderStatus } from '@/types'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { formatDate, STATUS_LABELS } from '@/lib/utils'
import { formatPhone } from '@/lib/phone'

interface OrdersSummary {
  total: number
  lastOrder: { id: string; status: OrderStatus; createdAt: string; deliveredAt: string | null } | null
}

interface AddrSnap {
  label?: string; address?: string; number?: string | null; complement?: string | null
  lat?: number | null; lng?: number | null; isDefault?: boolean
}
interface AuditEntry {
  id: string
  addressId: string | null
  action: 'CREATED' | 'UPDATED' | 'DELETED'
  before: AddrSnap | null
  after: AddrSnap | null
  changedByName: string | null
  changedAt: string
}

const ACTION = {
  CREATED: { label: 'Criado',   color: 'text-green-700 bg-green-50',  icon: Plus },
  UPDATED: { label: 'Editado',  color: 'text-amber-700 bg-amber-50',  icon: Edit2 },
  DELETED: { label: 'Excluído', color: 'text-red-700 bg-red-50',      icon: Trash2 },
}

// Rótulos e formatação dos campos auditáveis do próprio cliente.
const CUSTOMER_FIELDS: Record<string, string> = {
  name: 'Nome', phone: 'Telefone', assistance: 'Assistência', agency: 'Agência de entrega',
}
const fmtCustomerValue = (field: string, value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (value == null || value === '') return '—'
  return field === 'phone' ? formatPhone(String(value)) : String(value)
}

const coordStr = (a?: AddrSnap | null) =>
  a?.lat != null && a?.lng != null ? `${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}` : '—'
const addrLine = (a?: AddrSnap | null) =>
  a ? fullAddress({ address: a.address ?? '', number: a.number ?? undefined, complement: a.complement ?? undefined }) : '—'

// Campos que mudaram entre antes/depois (para 'Editado').
function diffFields(before: AddrSnap | null, after: AddrSnap | null) {
  const out: { label: string; from: string; to: string }[] = []
  const push = (label: string, from: string, to: string) => { if (from !== to) out.push({ label, from, to }) }
  push('Endereço',    before?.address ?? '—',    after?.address ?? '—')
  push('Número',      before?.number || '—',      after?.number || '—')
  push('Complemento', before?.complement || '—',  after?.complement || '—')
  push('Etiqueta',    before?.label ?? '—',       after?.label ?? '—')
  push('Coordenadas', coordStr(before),           coordStr(after))
  push('Padrão',      before?.isDefault ? 'Sim' : 'Não', after?.isDefault ? 'Sim' : 'Não')
  return out
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { can, isLoading } = useAccess()

  useEffect(() => {
    if (isLoading) return
    if (!can({ scope: 'customers:view' })) router.replace('/orders')
  }, [isLoading, can, router])

  const { data: customer } = useSWR<Customer>(`/customers/${id}`, (u: string) => api.get<Customer>(u))
  const { data: summary } = useSWR<OrdersSummary>(
    `/customers/${id}/orders-summary`, (u: string) => api.get<OrdersSummary>(u)
  )
  const { data: history = [] } = useSWR<AuditEntry[]>(
    `/customers/${id}/address-history`, (u: string) => api.get<AuditEntry[]>(u)
  )
  const canWarranty = can({ scope: 'warranties:view', feature: 'warranties' })
  const { data: warranty } = useSWR<WarrantyClientDetail>(
    canWarranty ? `/garantias/${id}` : null, (u: string) => api.get<WarrantyClientDetail>(u)
  )

  if (isLoading || !can({ scope: 'customers:view' })) return null
  if (!customer) {
    return <div className="flex h-64 items-center justify-center text-gray-400">Carregando…</div>
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/customers" className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Clientes
      </Link>

      {/* Cabeçalho */}
      <div className="mb-6 flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500">
            <Phone className="h-3.5 w-3.5" /> {formatPhone(customer.phone)}
          </p>
          {customer.agencyId && (
            <span
              className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700"
              title={customer.agencyAddress ?? undefined}
            >
              <Building2 className="h-3 w-3" /> Agência: {customer.agencyName}
            </span>
          )}
        </div>
        <Link
          href={`/customers/${id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </Link>
      </div>

      {/* Resumo de pedidos */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Total de pedidos</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{summary?.total ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-gray-500">Último pedido</p>
          {summary?.lastOrder ? (
            <Link href={`/orders/${summary.lastOrder.id}`} className="mt-1 block hover:underline">
              <span className="font-mono text-sm font-bold text-gray-900">#{summary.lastOrder.id.slice(-8).toUpperCase()}</span>
              <span className="ml-2 text-sm text-gray-500">{STATUS_LABELS[summary.lastOrder.status] ?? summary.lastOrder.status}</span>
              <p className="mt-0.5 text-xs text-gray-400">{formatDate(summary.lastOrder.createdAt)}</p>
            </Link>
          ) : (
            <p className="mt-1 text-sm text-gray-400">{summary ? 'Nenhum pedido ainda' : '—'}</p>
          )}
        </div>
      </div>

      {/* Termos de garantia aceitos */}
      {canWarranty && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-gray-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Termos de garantia</h2>
          </div>
          {!warranty || warranty.acceptances.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
              Nenhum termo de garantia registrado para este cliente.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="border-b border-gray-100 bg-gray-50">
                  <tr className="text-xs font-medium text-gray-500">
                    <th className="px-4 py-3 text-left">Versão</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Confirmado em</th>
                    <th className="px-4 py-3 text-left">Rubrica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {warranty.acceptances.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        v{a.termsVersion}
                        {warranty.currentVersion === a.termsVersion && (
                          <span className="ml-2 text-xs font-normal text-gray-400">(atual)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.status === 'confirmed' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                        }`}>
                          {a.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {a.confirmedAt ? formatDate(a.confirmedAt) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {a.signaturePath ? (
                          <img src={a.signaturePath} alt="Rubrica" className="max-h-10 rounded border border-gray-200 bg-white p-1" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Endereços atuais */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Endereços</h2>
      <div className="mb-8 space-y-2">
        {customer.addresses.map((a) => (
          <div key={a.id} className="flex items-start gap-2.5 rounded-xl border border-gray-200 bg-white p-4">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">{a.label}</span>
                {a.isDefault && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Padrão</span>}
              </div>
              <p className="text-sm text-gray-600">{fullAddress(a)}</p>
              {a.lat != null && a.lng != null && (
                <p className="text-xs text-gray-400">{a.lat.toFixed(5)}, {a.lng.toFixed(5)}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Histórico de alterações do cliente (nome/telefone) */}
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Histórico do cliente</h2>
      </div>

      {customer.audit.length === 0 ? (
        <div className="mb-8 rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
          Nenhuma alteração registrada.
        </div>
      ) : (
        <ol className="relative mb-8">
          <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
          {[...customer.audit].reverse().map((e: CustomerAuditEntry, idx) => (
            <li key={idx} className="relative pl-7 pb-5 last:pb-0">
              <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <Edit2 className="h-2.5 w-2.5" />
              </span>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-sm text-gray-500">
                  por <span className="font-medium text-gray-700">{e.changedByName ?? 'desconhecido'}</span>
                </p>
                <p className="text-xs text-gray-400">{formatDate(e.changedAt)}</p>
              </div>
              <div className="mt-1.5 space-y-1">
                {e.changes.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium text-gray-500">{CUSTOMER_FIELDS[c.field] ?? c.field}:</span>
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">{fmtCustomerValue(c.field, c.before)}</span>
                    <span className="text-gray-400">→</span>
                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">{fmtCustomerValue(c.field, c.after)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Histórico de alterações de endereço */}
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Histórico de endereços</h2>
      </div>

      {history.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
          Nenhuma alteração registrada.
        </div>
      ) : (
        <ol className="relative">
          <span aria-hidden className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" />
          {history.map((e) => {
            const meta = ACTION[e.action]
            const Icon = meta.icon
            const diffs = e.action === 'UPDATED' ? diffFields(e.before, e.after) : []
            return (
              <li key={e.id} className="relative pl-7 pb-5 last:pb-0">
                <span className={`absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full ${meta.color}`}>
                  <Icon className="h-2.5 w-2.5" />
                </span>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-sm">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    <span className="ml-2 text-gray-500">
                      por <span className="font-medium text-gray-700">{e.changedByName ?? 'desconhecido'}</span>
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(e.changedAt)}</p>
                </div>

                <div className="mt-1.5 text-sm text-gray-600">
                  {e.action === 'CREATED' && <p>{addrLine(e.after)}{e.after?.label ? ` · ${e.after.label}` : ''}</p>}
                  {e.action === 'DELETED' && <p className="line-through text-gray-400">{addrLine(e.before)}</p>}
                  {e.action === 'UPDATED' && (
                    <div className="space-y-1">
                      {diffs.map((d, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-medium text-gray-500">{d.label}:</span>
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-700 line-through">{d.from}</span>
                          <span className="text-gray-400">→</span>
                          <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">{d.to}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
