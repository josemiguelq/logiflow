'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const BRAZIL: L.LatLngTuple = [-15.78, -47.93]

interface Props {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}

// Mapa Leaflet (OSM) para confirmar lat/lng: marcador arrastável + click no mapa.
export default function AddressMap({ lat, lng, onChange }: Props) {
  const divRef    = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  useEffect(() => {
    if (!divRef.current) return
    const hasInitial = lat != null && lng != null
    const map = L.map(divRef.current, {
      center: hasInitial ? [lat!, lng!] : BRAZIL,
      zoom:   hasInitial ? 16 : 4,
    })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    const place = (la: number, ln: number) => {
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln])
      } else {
        markerRef.current = L.marker([la, ln], { draggable: true }).addTo(map)
        markerRef.current.on('dragend', () => {
          const p = markerRef.current!.getLatLng()
          onChangeRef.current(p.lat, p.lng)
        })
      }
    }
    if (hasInitial) place(lat!, lng!)
    map.on('click', (e: L.LeafletMouseEvent) => {
      place(e.latlng.lat, e.latlng.lng)
      onChangeRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current = map
    return () => {
      markerRef.current?.remove(); markerRef.current = null
      map.remove(); mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentraliza quando lat/lng vêm de fora (busca de endereço).
  useEffect(() => {
    const map = mapRef.current
    if (!map || lat == null || lng == null) return
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng])
    } else {
      markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map)
      markerRef.current.on('dragend', () => {
        const p = markerRef.current!.getLatLng()
        onChangeRef.current(p.lat, p.lng)
      })
    }
    map.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={divRef} style={{ height: '100%', width: '100%' }} className="z-0 rounded-xl" />
}
