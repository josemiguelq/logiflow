'use client'

import { use, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Phone, Truck, Clock, Package, Camera } from 'lucide-react'
import { Order } from '@/types'
import { api } from '@/lib/api'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate, getDelayInfo, formatDelayDuration, cancelReasonLabel } from '@/lib/utils'
import { formatPhone } from '@/lib/phone'
import { LiveMap } from '@/components/map'
import { AdjustAddressModal } from '@/components/orders/adjust-address-modal'
import { DelayFlag } from '@/components/orders/delay-flag'
import { useNow } from '@/hooks/useNow'
import { useDelayThresholds } from '@/hooks/useDelayThresholds'

const COMPLETED_STATUSES = ['DELIVERED', 'CANCELLED']

const LOG_ACTION_LABEL: Record<string, string> = {
  CREATED:           'Pedido criado',
  ASSIGNED:          'Atribuído a entregador',
  PICKED_UP:         'Retirado (em rota)',
  OUT_FOR_DELIVERY:  'Saiu para entrega',
  DELIVERED:         'Entregue',
  CANCELLED:         'Cancelado',
  RETURNED_TO_QUEUE: 'Devolvido à fila',
  NOTE_CHANGED:      'Observação alterada',
  ADDRESS_CHANGED:   'Endereço alterado',
}

const STATUS_STEP_LABEL: Record<string, string> = {
  CREATED:          'Criação',
  ASSIGNED:         'Atribuição',
  PICKED_UP:        'Retirada',
  OUT_FOR_DELIVERY: 'Saída p/ entrega',
  DELIVERED:        'Entrega',
}

function formatSeconds(total: number): string {
  if (total < 60) return `${total}s`
  const m = Math.round(total / 60)
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}min` : `${h}h`
}

function actorLabel(by: { type: string; name?: string }): string {
  const who = by.name || (by.type === 'deliverer' ? 'Entregador' : by.type === 'store_user' ? 'Operador' : 'Sistema')
  const kind = by.type === 'deliverer' ? 'entregador' : by.type === 'store_user' ? 'operador' : 'sistema'
  return `${who} · ${kind}`
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: order, isLoading, mutate } = useSWR<Order>(
    `/orders/${id}`,
    (url: string) => api.get<Order>(url)
  )
  const [adjusting, setAdjusting] = useState(false)
  const now        = useNow()
  const thresholds = useDelayThresholds()

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (!order) return <div className="p-6 text-gray-500">Pedido não encontrado</div>

  const delay = getDelayInfo(order, thresholds, now)

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/orders"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para pedidos
      </Link>

      {delay.level !== 'none' && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
            delay.level === 'red'
              ? 'border-red-300 bg-red-50 text-red-700'
              : 'border-yellow-300 bg-yellow-50 text-yellow-800'
          }`}
        >
          <Clock className="h-4 w-4 shrink-0" />
          <span>
            Pedido atrasado há <strong>{formatDelayDuration(delay.minutes)}</strong>{' '}
            {delay.phase === 'preparing' ? 'em preparação' : 'em rota'}.
          </span>
        </div>
      )}

      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          delay.level === 'red' ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Pedido #{order.id.slice(-8).toUpperCase()}
            </h1>
            <p className="text-sm text-gray-500">{formatDate(order.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={order.status} />
            {delay.level !== 'none' && <DelayFlag delay={delay} />}
          </div>
        </div>

        <div className={`mt-6 grid gap-4 ${order.status !== 'PREPARING' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {order.status !== 'PREPARING' && (
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                Código de Coleta
              </p>
              <p className="font-mono text-2xl font-bold text-gray-900">{order.pickupCode}</p>
            </div>
          )}
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
              Código de Entrega
            </p>
            <p className="font-mono text-2xl font-bold text-gray-900">{order.deliveryCode}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Cliente
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Package className="h-4 w-4 text-gray-400" />
                {order.customer.name}
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="h-4 w-4 text-gray-400" />
                {formatPhone(order.customer.phone)}
              </div>
              <div className="flex items-start gap-2 text-gray-700">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span>
                  {order.customer.address}
                  {order.customer.complement && ` — ${order.customer.complement}`}
                </span>
              </div>
              {!COMPLETED_STATUSES.includes(order.status) && (
                <button
                  onClick={() => setAdjusting(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Ajustar endereço de entrega
                </button>
              )}
            </div>
          </section>

          {order.deliverer && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Entregador
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Truck className="h-4 w-4 text-gray-400" />
                {order.deliverer.name}
                {order.routePosition !== undefined && (
                  <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                    Posição #{order.routePosition}
                  </span>
                )}
              </div>
            </section>
          )}

          <section className="border-t border-gray-100 pt-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Datas
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-gray-700">
                <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                <span className="text-gray-500">Criado em:</span>
                {formatDate(order.createdAt)}
              </div>
              {order.pickedUpAt && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-500">Coletado em:</span>
                  {formatDate(order.pickedUpAt)}
                </div>
              )}
              {order.deliveredAt && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Clock className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-500">Entregue em:</span>
                  {formatDate(order.deliveredAt)}
                </div>
              )}
            </div>
          </section>

          {order.notes && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Observações
              </h2>
              <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                {order.notes}
              </p>
            </section>
          )}

          {order.status === 'CANCELLED' && order.cancelReason && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Motivo do cancelamento
              </h2>
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-900">
                {cancelReasonLabel(order.cancelReason)}
                {order.cancelReason === 'OTHER' && order.deliveryNote
                  ? `: ${order.deliveryNote}`
                  : ''}
              </p>
            </section>
          )}

          {order.deliveryNote && !(order.status === 'CANCELLED' && order.cancelReason === 'OTHER') && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Nota do entregador
              </h2>
              <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                {order.deliveryNote}
              </p>
            </section>
          )}

          {order.proofs?.length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Comprovante de Entrega
                {order.proofs.length > 1 && (
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 normal-case tracking-normal">
                    {order.proofs.length} fotos
                  </span>
                )}
              </h2>
              <div className={`grid gap-2 ${order.proofs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {order.proofs.map((p, i) => (
                  <div key={i} className="overflow-hidden rounded-xl border border-gray-100">
                    <img
                      src={p.photoUrl}
                      alt={`Comprovante ${i + 1}`}
                      className="w-full object-contain"
                      style={{ maxHeight: order.proofs.length > 1 ? 240 : 480 }}
                    />
                    {(p.lat != null && p.lng != null) && (
                      <p className="px-2 pb-1.5 pt-1 text-xs text-gray-400">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {order.summary && order.summary.segments.length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Tempos por etapa
              </h2>
              <div className="space-y-1.5">
                {order.summary.segments.map((s, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">
                      {STATUS_STEP_LABEL[s.from] ?? s.from} → {STATUS_STEP_LABEL[s.to] ?? s.to}
                    </span>
                    <span className="font-medium text-gray-900">{formatSeconds(s.seconds)}</span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-sm">
                  <span className="font-semibold text-gray-700">Total</span>
                  <span className="font-bold text-gray-900">{formatSeconds(order.summary.totalSeconds)}</span>
                </div>
              </div>
            </section>
          )}

          {order.log && order.log.length > 0 && (
            <section className="border-t border-gray-100 pt-4">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Histórico / Auditoria
              </h2>
              <ol className="space-y-3">
                {[...order.log]
                  .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                  .map((e, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gray-300" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                          <p className="text-sm font-medium text-gray-900">
                            {LOG_ACTION_LABEL[e.action] ?? e.action}
                          </p>
                          <p className="text-xs text-gray-400">{formatDate(e.at)}</p>
                        </div>
                        <p className="text-xs text-gray-500">{actorLabel(e.by)}</p>
                        {e.action === 'NOTE_CHANGED' && e.details && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {(e.details.from as string) || '(vazio)'} → {(e.details.to as string) || '(vazio)'}
                          </p>
                        )}
                        {e.action === 'ADDRESS_CHANGED' && e.details?.to != null && (
                          <p className="mt-0.5 text-xs text-gray-500">Novo: {e.details.to as string}</p>
                        )}
                        {e.action === 'CANCELLED' && e.details?.reason != null && (
                          <p className="mt-0.5 text-xs text-gray-500">Motivo: {e.details.reason as string}</p>
                        )}
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      {adjusting && (
        <AdjustAddressModal
          orderId={order.id}
          customerId={order.customer.id}
          currentAddress={order.customer.address}
          onClose={() => setAdjusting(false)}
          onChanged={() => { setAdjusting(false); mutate() }}
        />
      )}
    </div>
  )
}
