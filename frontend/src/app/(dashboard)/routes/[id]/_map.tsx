'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface OrderPin {
  id: string
  customerName: string
  status: string
  routePosition?: number
  lat: number
  lng: number
}

interface TrailPoint {
  lat: number
  lng: number
  recorded_at?: string
}

interface Props {
  orders: OrderPin[]
  trail:  TrailPoint[]
}

function pinColor(status: string): string {
  switch (status) {
    case 'DELIVERED':        return '#16A34A'
    case 'OUT_FOR_DELIVERY': return '#EA580C'
    case 'CANCELLED':        return '#9CA3AF'
    default:                 return '#2563EB'
  }
}

function makeNumberedIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:30px;height:30px;border-radius:50%;
        background:${color};border:2.5px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.35);
        display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;color:#fff;font-family:sans-serif;
      ">${label}</div>`,
    iconSize:   [30, 30],
    iconAnchor: [15, 15],
    popupAnchor:[0, -18],
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function RouteMap({ orders, trail }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    mapRef.current = map

    const allPoints: L.LatLngExpression[] = []

    if (trail.length >= 2) {
      const coords = trail.map(p => [p.lat, p.lng] as L.LatLngExpression)

      // Polyline
      L.polyline(coords, {
        color:     '#6366F1',
        weight:    3,
        opacity:   0.7,
        dashArray: '6 4',
      }).addTo(map)

      // Start marker
      const startPoint = trail[0]!
      L.marker([startPoint.lat, startPoint.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:12px;height:12px;border-radius:50%;background:#22C55E;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
          iconAnchor: [6, 6],
        }),
      })
        .bindPopup(`Início${startPoint.recorded_at ? ` — ${fmtTime(startPoint.recorded_at)}` : ''}`)
        .addTo(map)

      // End marker
      const endPoint = trail[trail.length - 1]!
      L.marker([endPoint.lat, endPoint.lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:12px;height:12px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
          iconAnchor: [6, 6],
        }),
      })
        .bindPopup(`Último ponto${endPoint.recorded_at ? ` — ${fmtTime(endPoint.recorded_at)}` : ''}`)
        .addTo(map)

      // One circle per intermediate GPS point
      trail.slice(1, -1).forEach(p => {
        L.circleMarker([p.lat, p.lng], {
          radius:      4,
          color:       '#4338CA',
          weight:      1.5,
          opacity:     0.9,
          fillColor:   '#A5B4FC',
          fillOpacity: 1,
        })
          .bindPopup(p.recorded_at ? fmtTime(p.recorded_at) : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`)
          .addTo(map)
      })

      allPoints.push(...coords)
    }

    // Order pins (rendered on top of trail)
    orders.forEach((o, i) => {
      const color  = pinColor(o.status)
      const label  = String(o.routePosition ?? i + 1)
      const icon   = makeNumberedIcon(label, color)
      const marker = L.marker([o.lat, o.lng], { icon }).addTo(map)
      marker.bindPopup(`<strong>${o.customerName}</strong>`)
      allPoints.push([o.lat, o.lng])
    })

    if (allPoints.length > 0) {
      map.fitBounds(L.latLngBounds(allPoints), { padding: [32, 32], maxZoom: 15 })
    } else {
      map.setView([-15.78, -47.93], 5)
    }

    return () => { map.remove(); mapRef.current = null }
  }, [orders, trail])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
