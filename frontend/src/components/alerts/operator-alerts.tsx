'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import useSWR from 'swr'
import { Truck, Package, X, Undo2, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useWs } from '@/hooks/WsContext'
import { LiveMap } from '@/components/map'

interface StoreSettings {
  storeLat: number | null
  storeLng: number | null
  notifyOperatorDelayedThreshold: number
}

interface PickupAlert {
  pickupDelayed: number
}

// Distância em metros entre dois pontos (haversine).
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Entra no raio a 100m; só rearma depois de sair além de 150m (histerese).
const NEAR_ENTER_M = 100
const NEAR_EXIT_M  = 150

export function OperatorAlerts() {
  const { on } = useWs()

  const { data: settings } = useSWR<StoreSettings>(
    '/store/settings',
    (u: string) => api.get<StoreSettings>(u),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const { data: pickupAlert } = useSWR<PickupAlert>(
    '/orders/pickup-alert',
    (u: string) => api.get<PickupAlert>(u),
    { refreshInterval: 30_000 }
  )

  // Áudios criados sob demanda (lazy) — autoplay liberado após interação do operador.
  const proximityAudio = useRef<HTMLAudioElement | null>(null)
  const delayedAudio   = useRef<HTMLAudioElement | null>(null)
  const play = useCallback((ref: React.MutableRefObject<HTMLAudioElement | null>, src: string) => {
    try {
      if (!ref.current) ref.current = new Audio(src)
      ref.current.currentTime = 0
      ref.current.play().catch(() => { /* bloqueado até interação — ok */ })
    } catch { /* no-op */ }
  }, [])

  const playProximity = useCallback(() => play(proximityAudio, '/sounds/proximity.mp3'), [play])
  const playDelayed   = useCallback(() => play(delayedAudio, '/sounds/delayed.mp3'), [play])

  // ── Proximidade: toca quando um entregador entra no raio da loja ──
  const nearState = useRef<Map<string, boolean>>(new Map())
  useEffect(() => {
    const lat = settings?.storeLat
    const lng = settings?.storeLng
    if (lat == null || lng == null) return
    return on('deliverer_location', (data) => {
      const d = data as { delivererId: string; lat: number; lng: number }
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number') return
      const dist = distanceMeters(lat, lng, d.lat, d.lng)
      const wasNear = nearState.current.get(d.delivererId) ?? false
      if (!wasNear && dist <= NEAR_ENTER_M) {
        nearState.current.set(d.delivererId, true)
        playProximity()
      } else if (wasNear && dist > NEAR_EXIT_M) {
        nearState.current.set(d.delivererId, false)
      }
    })
  }, [on, settings?.storeLat, settings?.storeLng, playProximity])

  // ── Item 3: entregador concluiu a rota e há pedidos prontos esperando ──
  const [idleBanner, setIdleBanner] = useState<{ name: string; count: number } | null>(null)
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    return on('deliverer_idle_waiting', (data) => {
      const d = data as { delivererName?: string; waitingCount: number }
      setIdleBanner({ name: d.delivererName ?? 'Entregador', count: d.waitingCount })
      playProximity()
      clearTimeout(bannerTimer.current)
      bannerTimer.current = setTimeout(() => setIdleBanner(null), 20_000)
    })
  }, [on, playProximity])
  useEffect(() => () => clearTimeout(bannerTimer.current), [])

  // ── Rota automática criada: POPUP — avisa quais pedidos foram eleitos e que
  //    devem ser separados agora para o entregador da vez ──
  const [autoRouteAlert, setAutoRouteAlert] = useState<{
    delivererName: string
    pickupCode: string
    orders: { orderId: string; customerName: string; lat?: number; lng?: number }[]
  } | null>(null)
  useEffect(() => {
    return on('auto_route_created', (data) => {
      const d = data as {
        delivererName: string
        pickupCode: string
        orders: { orderId: string; customerName: string; lat?: number; lng?: number }[]
      }
      if (!Array.isArray(d?.orders)) return
      setAutoRouteAlert({
        delivererName: d.delivererName ?? 'Entregador',
        pickupCode:    d.pickupCode ?? '',
        orders:        d.orders,
      })
      playProximity()
    })
  }, [on, playProximity])

  // ── Devolver um pedido do popup de rota automática para a fila ──
  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null)
  const [returningId, setReturningId] = useState<string | null>(null)
  async function handleReturnToQueue(orderId: string) {
    setReturningId(orderId)
    try {
      await api.patch(`/orders/${orderId}/return-to-queue`)
      setAutoRouteAlert((prev) => {
        if (!prev) return prev
        const orders = prev.orders.filter((o) => o.orderId !== orderId)
        return orders.length > 0 ? { ...prev, orders } : null
      })
    } catch {
      // erro visível na UI global (toast), se configurada — item permanece na lista
    } finally {
      setReturningId(null)
      setConfirmReturnId(null)
    }
  }

  // ── Atraso: toca quando os pedidos atrasados cruzam o limiar configurado ──
  const delayedArmed = useRef(false)
  useEffect(() => {
    const threshold = settings?.notifyOperatorDelayedThreshold ?? 3
    const delayed   = pickupAlert?.pickupDelayed ?? 0
    if (delayed >= threshold) {
      if (!delayedArmed.current) {
        delayedArmed.current = true
        playDelayed()
      }
    } else {
      delayedArmed.current = false // rearma quando normaliza
    }
  }, [pickupAlert?.pickupDelayed, settings?.notifyOperatorDelayedThreshold, playDelayed])

  if (!idleBanner && !autoRouteAlert) return null

  return (
    <>
      {/* Toast: entregador livre com pedidos prontos esperando */}
      {idleBanner && (
        <div className="fixed left-1/2 top-4 z-50 w-[min(92vw,480px)] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 shadow-lg">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
              <Truck className="h-5 w-5 text-amber-600" />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-amber-900">
                {idleBanner.name} ficou livre
              </p>
              <p className="text-amber-800">
                {idleBanner.count} pedido{idleBanner.count !== 1 ? 's' : ''} pronto{idleBanner.count !== 1 ? 's' : ''} esperando — organize/atribua.
              </p>
            </div>
            <button
              onClick={() => setIdleBanner(null)}
              aria-label="Fechar aviso"
              className="-mr-1 shrink-0 rounded-md p-1 text-amber-500 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Popup (modal): rota automática criada → separar pedidos agora */}
      {autoRouteAlert && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <Package className="h-5 w-5 text-emerald-600" />
              </span>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900">Rota automática criada</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Para {autoRouteAlert.delivererName}
                </p>
              </div>
              <button
                onClick={() => setAutoRouteAlert(null)}
                aria-label="Fechar"
                className="-mr-1 ml-auto shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm font-medium text-gray-800">
              Separe os pedidos agora e entregue ao entregador:
            </p>

            <ul className="mt-3 space-y-1.5">
              {autoRouteAlert.orders.map((o) =>
                confirmReturnId === o.orderId ? (
                  <li
                    key={o.orderId}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-amber-900">
                      Devolver este pedido para a fila?
                    </span>
                    <button
                      onClick={() => setConfirmReturnId(null)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-white"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleReturnToQueue(o.orderId)}
                      disabled={returningId === o.orderId}
                      className="shrink-0 rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                    >
                      {returningId === o.orderId ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Devolver'
                      )}
                    </button>
                  </li>
                ) : (
                  <li
                    key={o.orderId}
                    className="flex items-center gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm"
                  >
                    <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-semibold text-emerald-700">
                      #{o.orderId.slice(-8).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-emerald-900">{o.customerName}</span>
                    <button
                      onClick={() => setConfirmReturnId(o.orderId)}
                      aria-label="Devolver pedido para a fila"
                      title="Devolver para a fila"
                      className="shrink-0 rounded-md p-1 text-emerald-500/70 hover:bg-white hover:text-emerald-700"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </li>
                )
              )}
            </ul>

            {autoRouteAlert.orders.some((o) => o.lat != null && o.lng != null) && (
              <div className="mt-3 h-48 overflow-hidden rounded-lg">
                <LiveMap
                  destinations={autoRouteAlert.orders
                    .filter((o) => o.lat != null && o.lng != null)
                    .map((o) => ({ id: o.orderId, lat: o.lat!, lng: o.lng!, label: o.customerName }))}
                  autoFitBounds
                  height="100%"
                />
              </div>
            )}

            {autoRouteAlert.pickupCode && (
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Código de retirada:{' '}
                <span className="font-mono font-semibold text-gray-900">{autoRouteAlert.pickupCode}</span>
              </p>
            )}

            <button
              onClick={() => setAutoRouteAlert(null)}
              className="mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-primary)' }}
            >
              Vou separar os pedidos
            </button>
          </div>
        </div>
      )}
    </>
  )
}
