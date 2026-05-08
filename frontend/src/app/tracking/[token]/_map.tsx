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

interface Props {
  delivererLat: number
  delivererLng: number
  delivererName: string
}

export default function TrackingMap({ delivererLat, delivererLng, delivererName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markerRef    = useRef<L.Marker | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
      .setView([delivererLat, delivererLng], 15)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)

    const marker = L.marker([delivererLat, delivererLng], { icon: truckIcon })
      .addTo(map)
      .bindPopup(delivererName)

    mapRef.current    = map
    markerRef.current = marker

    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return
    const latlng = L.latLng(delivererLat, delivererLng)
    markerRef.current.setLatLng(latlng)
    mapRef.current.panTo(latlng)
  }, [delivererLat, delivererLng])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
