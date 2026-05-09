'use client'

import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Truck, CheckCircle, XCircle, Clock, Star, MessageSquare } from 'lucide-react'

const TrackingMap = dynamic(() => import('./_map'), { ssr: false })

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface PublicOrder {
  id: string
  status: string
  customer: { name: string; address: string }
  deliverer?: { name: string }
  routePosition?: number
  isCurrentStop: boolean
  delivererLat?: number | null
  delivererLng?: number | null
  deliveryNote?: string
  rating?: number
  ratingComment?: string
}

const STATUS_INFO: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  PREPARING:        { label: 'Preparando seu pedido',      icon: Clock,        color: 'text-yellow-600' },
  ASSIGNED:         { label: 'Entregador a caminho',        icon: Truck,        color: 'text-blue-600' },
  ON_ROUTE:         { label: 'Pedido em rota',              icon: Truck,        color: 'text-indigo-600' },
  OUT_FOR_DELIVERY: { label: 'Saiu para entrega!',          icon: Truck,        color: 'text-orange-600' },
  DELIVERED:        { label: 'Pedido entregue!',            icon: CheckCircle,  color: 'text-green-600' },
  CANCELLED:        { label: 'Pedido cancelado',            icon: XCircle,      color: 'text-red-500' },
}

export default function PublicTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [order,   setOrder]   = useState<PublicOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${BASE}/tracking/${token}`)
        if (res.status === 410) { setExpired(true); return }
        if (res.ok) setOrder(await res.json())
      } finally {
        setLoading(false)
      }
    }

    load()
    const interval = setInterval(load, 15_000)
    return () => clearInterval(interval)
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Clock className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-lg font-semibold text-gray-800">Link expirado</p>
        <p className="text-sm text-gray-500">
          Este link de rastreamento não está mais disponível.<br />
          O prazo de 15 minutos após a finalização foi atingido.
        </p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center text-gray-500">
        <p className="text-lg font-medium">Pedido não encontrado</p>
      </div>
    )
  }

  const info = STATUS_INFO[order.status] ?? STATUS_INFO.PREPARING
  const Icon = info.icon
  const showMap = order.delivererLat != null && order.delivererLng != null &&
    ['ON_ROUTE', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(order.status)

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="flex h-14 items-center gap-2 bg-white px-4 shadow-sm">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600">
          <Truck className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="font-bold text-gray-900">LogiFlow</span>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Icon className={`h-8 w-8 ${info.color}`} />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{info.label}</h1>
          </div>

          {/* Live map */}
          {showMap && (
            <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 shadow-sm" style={{ height: 220 }}>
              <TrackingMap
                delivererLat={order.delivererLat!}
                delivererLng={order.delivererLng!}
                delivererName={order.deliverer?.name ?? 'Entregador'}
              />
            </div>
          )}

          <div className="space-y-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Cliente</p>
              <p className="mt-1 font-medium text-gray-900">{order.customer.name}</p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Endereço</p>
              <div className="mt-1 flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <p className="text-gray-900">{order.customer.address}</p>
              </div>
            </div>

            {order.deliverer && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Entregador</p>
                <div className="mt-1 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <p className="text-gray-900">{order.deliverer.name}</p>
                </div>
                {order.routePosition && order.routePosition > 1 && (
                  <p className="mt-1 text-sm text-gray-500">
                    Você é a parada #{order.routePosition} da rota
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Delivery note */}
          {order.deliveryNote && (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
                <p className="text-xs font-medium uppercase tracking-wide text-amber-600">Observação do entregador</p>
              </div>
              <p className="text-sm text-gray-800">{order.deliveryNote}</p>
            </div>
          )}

          {/* Customer rating */}
          {order.status === 'DELIVERED' && (
            <RatingWidget orderId={order.id} existingRating={order.rating} existingComment={order.ratingComment} />
          )}

          <p className="mt-6 text-center text-xs text-gray-400">
            Atualiza automaticamente a cada 15 segundos
          </p>
        </div>
      </main>
    </div>
  )
}

// ── Rating widget ─────────────────────────────────────────────────────────────

function RatingWidget({
  orderId, existingRating, existingComment,
}: {
  orderId: string
  existingRating?: number
  existingComment?: string
}) {
  const [selected, setSelected] = useState(existingRating ?? 0)
  const [hovered,  setHovered]  = useState(0)
  const [comment,  setComment]  = useState(existingComment ?? '')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done'>(
    existingRating ? 'done' : 'idle'
  )

  async function submit() {
    if (!selected) return
    setStatus('loading')
    try {
      await fetch(`${BASE}/tracking/${orderId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selected, comment: comment.trim() || undefined }),
      })
      setStatus('done')
    } catch {
      setStatus('idle')
    }
  }

  const display = hovered || selected

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      {status === 'done' ? (
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle className="h-8 w-8 text-green-500" />
          <p className="font-semibold text-gray-900">Obrigado pela avaliação!</p>
          <div className="flex gap-1 mt-1">
            {[1,2,3,4,5].map(n => (
              <Star
                key={n}
                className={`h-5 w-5 ${n <= selected ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
              />
            ))}
          </div>
          {existingComment && (
            <p className="text-sm text-gray-500 italic">"{existingComment}"</p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-3 text-center text-sm font-semibold text-gray-800">
            Como foi sua entrega?
          </p>
          <div
            className="flex justify-center gap-2 mb-4"
            onMouseLeave={() => setHovered(0)}
          >
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                onMouseEnter={() => setHovered(n)}
                onClick={() => setSelected(n)}
                className="transition-transform hover:scale-110 active:scale-95"
              >
                <Star
                  className={`h-8 w-8 transition-colors ${
                    n <= display
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Deixe um comentário (opcional)"
            className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
          />
          <button
            onClick={submit}
            disabled={!selected || status === 'loading'}
            className="mt-3 w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-40 hover:bg-gray-700"
          >
            {status === 'loading' ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </>
      )}
    </div>
  )
}
