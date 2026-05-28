'use client'

import { useEffect, useRef } from 'react'

interface TrailPoint { lat: number; lng: number; recorded_at?: string }

interface Destination {
  lat: number; lng: number; label: string; status?: string
}

export interface ProofMarker {
  lat: number; lng: number; label: string
}

interface Props {
  delivererLat?:   number | null
  delivererLng?:   number | null
  delivererName?:  string
  destinations?:   Destination[]
  proofMarkers?:   ProofMarker[]
  trail?:          TrailPoint[]
  height?:         string
  autoFitBounds?:  boolean
}

const DEFAULT_CENTER = { lat: -20.4697, lng: -54.6201 }
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

let loadPromise: Promise<void> | null = null

function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.google?.maps) return Promise.resolve()
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}`
    script.async = true
    script.onload  = () => resolve()
    script.onerror = () => reject(new Error('Google Maps failed to load'))
    document.head.appendChild(script)
  })
  return loadPromise
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function DelivererGoogleMap({
  delivererLat,
  delivererLng,
  delivererName = 'Entregador',
  destinations  = [],
  proofMarkers  = [],
  trail         = [],
  height        = '100%',
  autoFitBounds = false,
}: Props) {
  const divRef           = useRef<HTMLDivElement>(null)
  const mapRef           = useRef<google.maps.Map | null>(null)
  const delivererRef     = useRef<google.maps.Marker | null>(null)
  const destMarkersRef   = useRef<google.maps.Marker[]>([])
  const proofMarkersRef  = useRef<google.maps.Marker[]>([])
  const trailLayersRef   = useRef<(google.maps.Polyline | google.maps.Circle | google.maps.Marker)[]>([])
  const infoWindowRef    = useRef<google.maps.InfoWindow | null>(null)

  // Init map
  useEffect(() => {
    if (!divRef.current) return
    let cancelled = false

    loadGoogleMaps().then(() => {
      if (cancelled || !divRef.current || mapRef.current) return

      const center = (delivererLat != null && delivererLng != null)
        ? { lat: delivererLat, lng: delivererLng }
        : DEFAULT_CENTER

      mapRef.current = new google.maps.Map(divRef.current, {
        center,
        zoom: 14,
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
      })

      infoWindowRef.current = new google.maps.InfoWindow()
    })

    return () => {
      cancelled = true
      delivererRef.current?.setMap(null)
      delivererRef.current = null
      destMarkersRef.current.forEach(m => m.setMap(null))
      destMarkersRef.current = []
      proofMarkersRef.current.forEach(m => m.setMap(null))
      proofMarkersRef.current = []
      trailLayersRef.current.forEach(l => l.setMap(null))
      trailLayersRef.current = []
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deliverer marker
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (delivererLat != null && delivererLng != null) {
      const pos = { lat: delivererLat, lng: delivererLng }
      if (delivererRef.current) {
        delivererRef.current.setPosition(pos)
      } else {
        delivererRef.current = new google.maps.Marker({
          position: pos,
          map,
          title: delivererName,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale:       10,
            fillColor:   '#2563EB',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2.5,
          },
          zIndex: 20,
        })
        delivererRef.current.addListener('click', () => {
          infoWindowRef.current?.setContent(`<strong>${delivererName}</strong>`)
          infoWindowRef.current?.open(map, delivererRef.current!)
        })
      }
      map.panTo(pos)
    } else {
      delivererRef.current?.setMap(null)
      delivererRef.current = null
    }
  }, [delivererLat, delivererLng, delivererName])

  // Destination markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    destMarkersRef.current.forEach(m => m.setMap(null))
    destMarkersRef.current = destinations.map((d, i) => {
      const marker = new google.maps.Marker({
        position: { lat: d.lat, lng: d.lng },
        map,
        label:    { text: String(i + 1), color: '#fff', fontWeight: 'bold', fontSize: '12px' },
        title:    d.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale:       14,
          fillColor:   '#DC2626',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
        zIndex: 10,
      })
      marker.addListener('click', () => {
        const content = d.status
          ? `<strong>${d.label}</strong><br>${d.status}`
          : `<strong>${d.label}</strong>`
        infoWindowRef.current?.setContent(content)
        infoWindowRef.current?.open(map, marker)
      })
      return marker
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations])

  // autoFitBounds: fit map to destinations + deliverer + proof markers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !autoFitBounds) return

    const allPoints: { lat: number; lng: number }[] = [
      ...destinations,
      ...proofMarkers,
      ...(delivererLat != null && delivererLng != null ? [{ lat: delivererLat, lng: delivererLng }] : []),
    ]
    if (allPoints.length === 0) return

    const bounds = new google.maps.LatLngBounds()
    allPoints.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }))
    map.fitBounds(bounds, 60)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations, proofMarkers, delivererLat, delivererLng, autoFitBounds])

  // Proof photo location markers (purple camera)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    proofMarkersRef.current.forEach(m => m.setMap(null))
    proofMarkersRef.current = proofMarkers.map((p) => {
      const svgIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13" fill="#7C3AED" stroke="white" stroke-width="2"/><path d="M9 10l1.5-2h7L19 10h2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h2zm5 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" fill="white"/></svg>')}`
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        title: p.label,
        icon: { url: svgIcon, scaledSize: new google.maps.Size(28, 28), anchor: new google.maps.Point(14, 14) },
        zIndex: 15,
      })
      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(`<strong>📷 Foto tirada aqui</strong><br>${p.label}`)
        infoWindowRef.current?.open(map, marker)
      })
      return marker
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofMarkers])

  // Trail
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    trailLayersRef.current.forEach(l => l.setMap(null))
    trailLayersRef.current = []

    if (trail.length < 2) return

    const path = trail.map(p => ({ lat: p.lat, lng: p.lng }))

    const polyline = new google.maps.Polyline({
      path,
      geodesic:     true,
      strokeColor:  '#3B82F6',
      strokeOpacity: 0.8,
      strokeWeight:  3,
      map,
      zIndex: 1,
    })

    const dots: (google.maps.Circle | google.maps.Marker)[] = trail.slice(1, -1).map(p => {
      const circle = new google.maps.Circle({
        center:      { lat: p.lat, lng: p.lng },
        radius:      8,
        fillColor:   '#93C5FD',
        fillOpacity: 1,
        strokeColor: '#1D4ED8',
        strokeWeight: 1.5,
        map,
        zIndex: 2,
      })
      if (p.recorded_at) {
        circle.addListener('click', () => {
          infoWindowRef.current?.setContent(fmtTime(p.recorded_at!))
          infoWindowRef.current?.setPosition({ lat: p.lat, lng: p.lng })
          infoWindowRef.current?.open(map)
        })
      }
      return circle
    })

    // Start marker
    const start = trail[0]!
    const startMarker = new google.maps.Marker({
      position: { lat: start.lat, lng: start.lng },
      map,
      title: 'Início',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8, fillColor: '#22C55E', fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 2,
      },
      zIndex: 3,
    })
    if (start.recorded_at) {
      startMarker.addListener('click', () => {
        infoWindowRef.current?.setContent(`Início — ${fmtTime(start.recorded_at!)}`)
        infoWindowRef.current?.open(map, startMarker)
      })
    }

    // End marker
    const end = trail[trail.length - 1]!
    const endMarker = new google.maps.Marker({
      position: { lat: end.lat, lng: end.lng },
      map,
      title: 'Último ponto',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8, fillColor: '#EF4444', fillOpacity: 1,
        strokeColor: '#fff', strokeWeight: 2,
      },
      zIndex: 3,
    })
    if (end.recorded_at) {
      endMarker.addListener('click', () => {
        infoWindowRef.current?.setContent(`Último ponto — ${fmtTime(end.recorded_at!)}`)
        infoWindowRef.current?.open(map, endMarker)
      })
    }

    trailLayersRef.current = [polyline, ...dots, startMarker, endMarker]

    const bounds = new google.maps.LatLngBounds()
    path.forEach(p => bounds.extend(p))
    map.fitBounds(bounds, 40)
  }, [trail])

  return (
    <div ref={divRef} style={{ height, width: '100%' }} className="rounded-xl" />
  )
}
