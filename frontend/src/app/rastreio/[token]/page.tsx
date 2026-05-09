'use client'

import { use, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Truck, CheckCircle, XCircle, Clock, Star, MessageSquare, Package } from 'lucide-react'

const TrackingMap = dynamic(() => import('./_map'), { ssr: false })

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

interface PublicOrder {
  id:            string
  status:        string
  customer:      { name: string; address: string }
  deliverer?:    { name: string }
  routePosition?: number
  isCurrentStop:  boolean
  delivererLat?:  number | null
  delivererLng?:  number | null
  deliveryNote?:  string
  rating?:        number
  ratingComment?: string
}

const STATUS_INFO: Record<string, {
  label:    string
  sub:      string
  icon:     typeof Clock
  color:    string
  bgColor:  string
}> = {
  PREPARING:        { label: 'Preparando seu pedido',      sub: 'Seu pedido está sendo separado',              icon: Package,       color: 'text-yellow-600',  bgColor: 'bg-yellow-50'  },
  ASSIGNED:         { label: 'Entregador alocado',          sub: 'Em breve o entregador irá buscar seu pedido', icon: Truck,         color: 'text-blue-600',    bgColor: 'bg-blue-50'    },
  ON_ROUTE:         { label: 'Pedido em rota',              sub: 'O entregador está a caminho',                 icon: Truck,         color: 'text-indigo-600',  bgColor: 'bg-indigo-50'  },
  OUT_FOR_DELIVERY: { label: 'Saiu para entrega!',          sub: 'O entregador está perto de você',             icon: Truck,         color: 'text-orange-600',  bgColor: 'bg-orange-50'  },
  DELIVERED:        { label: 'Pedido entregue!',            sub: 'Sua entrega foi concluída com sucesso',       icon: CheckCircle,   color: 'text-green-600',   bgColor: 'bg-green-50'   },
  CANCELLED:        { label: 'Pedido cancelado',            sub: 'Entre em contato com a loja para mais informações', icon: XCircle, color: 'text-red-500',     bgColor: 'bg-red-50'     },
}

const STEP_STATUSES = ['PREPARING', 'ASSIGNED', 'ON_ROUTE', 'OUT_FOR_DELIVERY', 'DELIVERED']
const STEP_LABELS   = ['Preparando', 'Alocado', 'Em rota', 'Saiu', 'Entregue']

function stepIndex(status: string) {
  const i = STEP_STATUSES.indexOf(status)
  return i === -1 ? 0 : i
}

export default function CustomerTrackingPage({ params }: { params: Promise<{ token: string }> }) {
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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-900 border-t-transparent" />
      </div>
    )
  }

  if (expired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Clock className="h-8 w-8 text-gray-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-800">Link expirado</p>
          <p className="mt-1 text-sm text-gray-500">
            Este link de rastreamento não está mais disponível.<br />
            O prazo de 15 minutos após a finalização foi atingido.
          </p>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Pedido não encontrado.</p>
      </div>
    )
  }

  const info        = STATUS_INFO[order.status] ?? STATUS_INFO.PREPARING
  const Icon        = info.icon
  const isCancelled = order.status === 'CANCELLED'
  const isDelivered = order.status === 'DELIVERED'
  const currentStep = stepIndex(order.status)
  const showMap     = order.delivererLat != null && order.delivererLng != null &&
    ['ON_ROUTE', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(order.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900">
            <Truck className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold text-gray-900">LogiFlow</span>
          <span className="ml-auto text-xs text-gray-400">Rastreamento de pedido</span>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-6 space-y-4">
        {/* Status card */}
        <div className={`rounded-2xl ${info.bgColor} p-5`}>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <Icon className={`h-7 w-7 ${info.color}`} />
            </div>
            <div>
              <p className={`text-lg font-bold ${info.color}`}>{info.label}</p>
              <p className="text-sm text-gray-600">{info.sub}</p>
            </div>
          </div>
        </div>

        {/* Progress stepper (only for non-cancelled) */}
        {!isCancelled && (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center">
              {STEP_STATUSES.map((s, i) => (
                <div key={s} className="flex flex-1 flex-col items-center">
                  <div className="relative flex w-full items-center">
                    {i > 0 && (
                      <div className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= currentStep ? 'bg-gray-900' : 'bg-gray-200'
                      }`} />
                    )}
                    <div className={`h-6 w-6 shrink-0 rounded-full border-2 transition-colors ${
                      i < currentStep  ? 'border-gray-900 bg-gray-900'  :
                      i === currentStep ? 'border-gray-900 bg-white'     :
                                         'border-gray-200 bg-white'
                    } flex items-center justify-center`}>
                      {i < currentStep && (
                        <CheckCircle className="h-3.5 w-3.5 text-white fill-white" />
                      )}
                      {i === currentStep && (
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-900" />
                      )}
                    </div>
                    {i < STEP_STATUSES.length - 1 && (
                      <div className={`h-1 flex-1 rounded-full transition-colors ${
                        i < currentStep ? 'bg-gray-900' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                  <p className={`mt-1 text-center text-[10px] font-medium ${
                    i <= currentStep ? 'text-gray-800' : 'text-gray-400'
                  }`}>
                    {STEP_LABELS[i]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live map */}
        {showMap && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm" style={{ height: 240 }}>
            <TrackingMap
              delivererLat={order.delivererLat!}
              delivererLng={order.delivererLng!}
              delivererName={order.deliverer?.name ?? 'Entregador'}
            />
          </div>
        )}

        {/* Info cards */}
        <div className="space-y-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
            <p className="mt-1 font-semibold text-gray-900">{order.customer.name}</p>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Endereço de entrega</p>
            <div className="mt-1 flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <p className="text-gray-900">{order.customer.address}</p>
            </div>
          </div>

          {order.deliverer && (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Entregador</p>
              <div className="mt-1 flex items-center gap-2">
                <Truck className="h-4 w-4 text-gray-400" />
                <p className="text-gray-900">{order.deliverer.name}</p>
              </div>
              {order.routePosition && order.routePosition > 1 && (
                <p className="mt-1 text-sm text-gray-500">Você é a parada #{order.routePosition} da rota</p>
              )}
            </div>
          )}
        </div>

        {/* Delivery note */}
        {order.deliveryNote && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Observação do entregador</p>
            </div>
            <p className="text-sm text-gray-800">{order.deliveryNote}</p>
          </div>
        )}

        {/* Rating */}
        {isDelivered && (
          <RatingWidget
            orderId={order.id}
            existingRating={order.rating}
            existingComment={order.ratingComment}
          />
        )}

        <p className="text-center text-xs text-gray-400 pb-4">
          Atualiza automaticamente a cada 15 segundos
        </p>
      </main>
    </div>
  )
}

// ── Rating widget ─────────────────────────────────────────────────────────────

function RatingWidget({
  orderId, existingRating, existingComment,
}: {
  orderId:         string
  existingRating?: number
  existingComment?: string
}) {
  const [selected, setSelected] = useState(existingRating ?? 0)
  const [hovered,  setHovered]  = useState(0)
  const [comment,  setComment]  = useState(existingComment ?? '')
  const [status,   setStatus]   = useState<'idle' | 'loading' | 'done'>(
    existingRating ? 'done' : 'idle'
  )
  const [error, setError] = useState('')

  async function submit() {
    if (!selected) return
    setStatus('loading')
    setError('')
    try {
      const res = await fetch(`${BASE}/tracking/${orderId}/rating`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rating: selected, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Erro ao enviar avaliação')
        setStatus('idle')
        return
      }
      setStatus('done')
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setStatus('idle')
    }
  }

  const display = hovered || selected

  const STAR_LABELS = ['', 'Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente']

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      {status === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <CheckCircle className="h-7 w-7 text-green-500" />
          </div>
          <div>
            <p className="font-bold text-gray-900">Obrigado pela avaliação!</p>
            <p className="text-sm text-gray-500">Seu feedback nos ajuda a melhorar</p>
          </div>
          <div className="flex gap-1.5">
            {[1,2,3,4,5].map(n => (
              <Star
                key={n}
                className={`h-6 w-6 ${n <= selected ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}
              />
            ))}
          </div>
          {existingComment && (
            <p className="text-sm text-gray-500 italic max-w-xs">"{existingComment}"</p>
          )}
        </div>
      ) : (
        <>
          <p className="mb-1 text-center font-bold text-gray-900">Como foi sua entrega?</p>
          <p className="mb-4 text-center text-sm text-gray-500">Sua opinião é muito importante para nós</p>

          <div
            className="flex justify-center gap-3 mb-2"
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
                  className={`h-9 w-9 transition-colors ${
                    n <= display ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'
                  }`}
                />
              </button>
            ))}
          </div>

          {display > 0 && (
            <p className="mb-3 text-center text-sm font-medium text-gray-600">
              {STAR_LABELS[display]}
            </p>
          )}

          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Deixe um comentário (opcional)"
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-gray-300 focus:outline-none"
          />

          {error && <p className="mt-2 text-center text-sm text-red-500">{error}</p>}

          <button
            onClick={submit}
            disabled={!selected || status === 'loading'}
            className="mt-3 w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-40 hover:bg-gray-700"
          >
            {status === 'loading' ? 'Enviando...' : 'Enviar avaliação'}
          </button>
        </>
      )}
    </div>
  )
}
