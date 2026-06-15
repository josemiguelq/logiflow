'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const truckIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

const destIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

// Marcador circular com a foto do entregador (fallback: marcador de caminhão).
function delivererIcon(photoUrl?: string): L.Icon | L.DivIcon {
  if (!photoUrl) return truckIcon
  return L.divIcon({
    className: '',
    html: `<img src="${photoUrl}" style="width:44px;height:44px;border-radius:9999px;object-fit:cover;border:3px solid #2563EB;box-shadow:0 1px 4px rgba(0,0,0,.4);background:#fff" />`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
    popupAnchor:[0, -22],
  })
}

interface LatLng { lat: number; lng: number }

interface Props {
  delivererLat: number
  delivererLng: number
  delivererName: string
  delivererPhotoUrl?: string
  trail?: LatLng[]
  destLat?: number
  destLng?: number
  destLabel?: string
}

export default function TrackingMap({
  delivererLat, delivererLng, delivererName, delivererPhotoUrl, trail,
  destLat, destLng, destLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)
  const trailRef     = useRef<L.Polyline | null>(null)

  const hasDest = destLat != null && destLng != null

  // Enquadra entregador + destino + trajeto.
  function fit(map: L.Map) {
    const pts: L.LatLngExpression[] = [[delivererLat, delivererLng]]
    if (hasDest) pts.push([destLat!, destLng!])
    for (const p of trail ?? []) pts.push([p.lat, p.lng])
    if (pts.length > 1) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 })
    } else {
      map.setView([delivererLat, delivererLng], 15)
    }
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
      .setView([delivererLat, delivererLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    // Tracejado do trajeto percorrido pelo entregador.
    if (trail && trail.length >= 2) {
      trailRef.current = L.polyline(
        trail.map(p => [p.lat, p.lng] as L.LatLngExpression),
        { color: '#2563EB', weight: 4, opacity: 0.7, dashArray: '6 8' },
      ).addTo(map)
    }

    markerRef.current = L.marker([delivererLat, delivererLng], { icon: delivererIcon(delivererPhotoUrl) })
      .addTo(map)
      .bindPopup(delivererName)

    if (hasDest) {
      L.marker([destLat!, destLng!], { icon: destIcon })
        .addTo(map)
        .bindPopup(destLabel ?? 'Endereço de entrega')
    }

    fit(map)
    mapRef.current = map

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; trailRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza posição, foto e tracejado quando os dados mudam (refetch periódico).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !markerRef.current) return

    markerRef.current.setLatLng(L.latLng(delivererLat, delivererLng))
    markerRef.current.setIcon(delivererIcon(delivererPhotoUrl))

    if (trail && trail.length >= 2) {
      const pts = trail.map(p => [p.lat, p.lng] as L.LatLngExpression)
      if (trailRef.current) {
        trailRef.current.setLatLngs(pts)
      } else {
        trailRef.current = L.polyline(pts, { color: '#2563EB', weight: 4, opacity: 0.7, dashArray: '6 8' }).addTo(map)
      }
    }

    fit(map)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivererLat, delivererLng, delivererPhotoUrl, trail, destLat, destLng, hasDest])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
