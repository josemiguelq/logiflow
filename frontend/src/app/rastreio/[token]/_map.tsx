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

interface Props {
  delivererLat: number
  delivererLng: number
  delivererName: string
  destLat?: number
  destLng?: number
  destLabel?: string
}

export default function TrackingMap({
  delivererLat, delivererLng, delivererName,
  destLat, destLng, destLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)

  const hasDest = destLat != null && destLng != null

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
      .setView([delivererLat, delivererLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    markerRef.current = L.marker([delivererLat, delivererLng], { icon: truckIcon })
      .addTo(map)
      .bindPopup(delivererName)

    if (hasDest) {
      L.marker([destLat!, destLng!], { icon: destIcon })
        .addTo(map)
        .bindPopup(destLabel ?? 'Endereço de entrega')
      // Enquadra os dois pontos (entregador + destino).
      map.fitBounds(
        L.latLngBounds([[delivererLat, delivererLng], [destLat!, destLng!]]),
        { padding: [48, 48], maxZoom: 16 },
      )
    }

    mapRef.current = map

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Atualiza a posição do entregador; mantém os dois pontos visíveis quando há destino.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    const latlng = L.latLng(delivererLat, delivererLng)
    markerRef.current.setLatLng(latlng)
    if (hasDest) {
      mapRef.current.fitBounds(
        L.latLngBounds([[delivererLat, delivererLng], [destLat!, destLng!]]),
        { padding: [48, 48], maxZoom: 16 },
      )
    } else {
      mapRef.current.panTo(latlng)
    }
  }, [delivererLat, delivererLng, destLat, destLng, hasDest])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
