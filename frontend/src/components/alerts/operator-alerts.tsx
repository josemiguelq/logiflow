'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import useSWR from 'swr'
import { Truck, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useWs } from '@/hooks/WsContext'

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

  if (!idleBanner) return null

  return (
    <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
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
  )
}
