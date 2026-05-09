'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface StorePin {
  id:        string
  name:      string
  lat:       number
  lng:       number
  delivered: number
}

interface Props {
  stores: StorePin[]
}

export default function StoresMap({ stores }: Props) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    const map = L.map(divRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    mapRef.current = map

    const points: L.LatLngExpression[] = []

    stores.forEach(s => {
      const icon = L.divIcon({
        className: '',
        html: `
          <div style="
            background:#111827;border:2.5px solid #fff;
            box-shadow:0 2px 6px rgba(0,0,0,.4);
            border-radius:50%;width:28px;height:28px;
            display:flex;align-items:center;justify-content:center;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
              fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>`,
        iconSize:    [28, 28],
        iconAnchor:  [14, 14],
        popupAnchor: [0, -18],
      })

      const marker = L.marker([s.lat, s.lng], { icon }).addTo(map)
      marker.bindPopup(
        `<div style="font-family:sans-serif;min-width:120px">
          <p style="font-weight:700;font-size:13px;margin:0 0 4px">${s.name}</p>
          <p style="font-size:12px;color:#16a34a;margin:0">${s.delivered} entregas</p>
        </div>`,
        { closeButton: false }
      )
      points.push([s.lat, s.lng])
    })

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 14 })
    } else {
      map.setView([-15.78, -47.93], 4)
    }

    return () => { map.remove(); mapRef.current = null }
  }, [stores])

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
