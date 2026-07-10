'use client'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle, MapPin, Truck, User, ExternalLink } from 'lucide-react'
import { Order, OrderInconsistency } from '@/types'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Props {
  order: Order
  onAck: () => void
}

const BRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Texto em português para cada tipo de inconsistência.
export function describeInconsistency(inc: OrderInconsistency): string {
  const d = inc.details ?? {}
  if (inc.type === 'DELIVERED_OFF_TARGET') {
    const meters = Number(d.distanceMeters ?? 0)
    return `Entrega registrada a ~${meters} m do endereço do cliente.`
  }
  if (inc.type === 'SHORT_PAYMENT') {
    const expected = Number(d.expected ?? 0)
    const collected = Number(d.collected ?? 0)
    const shortfall = Number(d.shortfall ?? expected - collected)
    return `Valor recebido (${BRL(collected)}) menor que o esperado (${BRL(expected)}). Faltam ${BRL(shortfall)}.`
  }
  return 'Inconsistência na entrega.'
}

export function InconsistencyModal({ order, onAck }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // A foto do comprovante não vem no evento de WS (é gravada logo após a leitura
  // inicial do pedido). Busca o pedido completo para exibir foto/endereço/etc,
  // usando o payload recebido como fallback para renderizar imediatamente.
  const { data } = useSWR<Order>(
    `/orders/${order.id}`,
    (u: string) => api.get<Order>(u),
    { fallbackData: order, revalidateOnFocus: false },
  )
  const full = data ?? order

  const inconsistencies = full.summary?.inconsistencies ?? []
  const shortPayment = inconsistencies.find(i => i.type === 'SHORT_PAYMENT')
  const photoUrl = full.proofs?.[0]?.photoUrl ?? full.proof?.photoUrl ?? null
  const address = [full.customer.address, full.customer.complement].filter(Boolean).join(' — ')

  async function handleAck() {
    setLoading(true)
    setError('')
    try {
      await api.post(`/orders/${order.id}/inconsistencies/ack`, {})
      onAck()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao registrar')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Inconsistência na entrega</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Pedido #{order.id.slice(-8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* Dados do pedido */}
        <div className="mb-4 space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm">
          <div className="flex items-center gap-2 text-gray-700">
            <User className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="font-medium">{full.customer.name}</span>
          </div>
          <div className="flex items-center gap-2 text-gray-700">
            <Truck className="h-4 w-4 shrink-0 text-gray-400" />
            <span>{full.deliverer?.name ?? 'Sem entregador'}</span>
          </div>
          <div className="flex items-start gap-2 text-gray-700">
            <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
            <span>{address || 'Endereço não informado'}</span>
          </div>
        </div>

        {/* Foto do comprovante */}
        {photoUrl && (
          <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="mb-4 block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt="Comprovante de entrega"
              className="max-h-56 w-full rounded-xl object-cover"
            />
          </a>
        )}

        {/* Lista de inconsistências */}
        <ul className="space-y-2">
          {inconsistencies.map((inc, i) => (
            <li
              key={i}
              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            >
              {describeInconsistency(inc)}
            </li>
          ))}
        </ul>

        {/* Detalhe dos valores (inconsistência de pagamento) */}
        {shortPayment && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
              <p className="text-xs text-gray-500">Esperado</p>
              <p className="font-semibold text-gray-900">{BRL(Number(shortPayment.details.expected ?? 0))}</p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
              <p className="text-xs text-gray-500">Recebido</p>
              <p className="font-semibold text-gray-900">{BRL(Number(shortPayment.details.collected ?? 0))}</p>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <Link
            href={`/orders/${order.id}`}
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            Ver pedido
          </Link>
          <Button className="ml-auto" onClick={handleAck} disabled={loading}>
            {loading ? 'Registrando…' : 'Entendi'}
          </Button>
        </div>
      </div>
    </div>
  )
}
