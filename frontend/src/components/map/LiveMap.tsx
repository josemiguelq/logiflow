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

const delivererIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

const destinationIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

const blueDestinationIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

const grayDestinationIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
  shadowUrl:  'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:   [25, 41],
  iconAnchor: [12, 41],
  popupAnchor:[1, -34],
})

export interface MapDestination {
  id?: string
  lat: number
  lng: number
  label: string
  status?: string
  selected?: boolean
  selectable?: boolean
  markerColor?: 'red' | 'gray' | 'blue'
  selectionOrder?: number   // when set, renders a numbered badge instead of a plain marker
}

export interface TrailPoint {
  lat: number
  lng: number
  recorded_at?: string
}

interface Props {
  delivererLat?: number | null
  delivererLng?: number | null
  delivererName?: string
  destinations?: MapDestination[]
  trail?: TrailPoint[]
  height?: string
  autoFitBounds?: boolean
  onDestinationClick?: (id: string) => void
}

const DEFAULT_CENTER: L.LatLngTuple = [-20.4697, -54.6201]

export function LiveMap({
  delivererLat,
  delivererLng,
  delivererName = 'Entregador',
  destinations = [],
  trail = [],
  height = '100%',
  autoFitBounds = false,
  onDestinationClick,
}: Props) {
  const divRef              = useRef<HTMLDivElement>(null)
  const mapRef              = useRef<L.Map | null>(null)
  const delivererMarkerRef  = useRef<L.Marker | null>(null)
  const destMarkersRef      = useRef<L.Marker[]>([])
  const trailLayersRef      = useRef<L.Layer[]>([])

  // Initialize and destroy the Leaflet map.
  // Vanilla Leaflet (no react-leaflet) gives us explicit cleanup control,
  // which is necessary to avoid "Map container already initialized" under
  // React 19 StrictMode.
  useEffect(() => {
    if (!divRef.current) return

    const map = L.map(divRef.current, { center: DEFAULT_CENTER, zoom: 14 })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    mapRef.current = map

    return () => {
      // Remove markers before removing the map to avoid errors from
      // Leaflet trying to call removeLayer on a destroyed map.
      delivererMarkerRef.current?.remove()
      delivererMarkerRef.current = null
      destMarkersRef.current.forEach((m) => m.remove())
      destMarkersRef.current = []
      trailLayersRef.current.forEach((l) => l.remove())
      trailLayersRef.current = []

      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update/create the deliverer marker when position changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (delivererLat != null && delivererLng != null) {
      const pos: L.LatLngTuple = [delivererLat, delivererLng]

      if (delivererMarkerRef.current) {
        delivererMarkerRef.current.setLatLng(pos)
        delivererMarkerRef.current.getPopup()?.setContent(delivererName)
      } else {
        delivererMarkerRef.current = L.marker(pos, { icon: delivererIcon })
          .bindPopup(delivererName)
          .addTo(map)
      }

      map.flyTo(pos, map.getZoom(), { animate: true, duration: 1 })
    } else {
      delivererMarkerRef.current?.remove()
      delivererMarkerRef.current = null
    }
  }, [delivererLat, delivererLng, delivererName])

  // Rebuild destination markers when the list changes.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    destMarkersRef.current.forEach((m) => m.remove())
    destMarkersRef.current = destinations.map((d) => {
      const popup = d.status
        ? `<strong>${d.label}</strong><br>${d.status}`
        : `<strong>${d.label}</strong>`
      const icon = d.selectionOrder != null
        ? new L.DivIcon({
            className: '',
            html: `<div style="width:28px;height:28px;border-radius:50%;background:#2563EB;color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);font-family:sans-serif">${d.selectionOrder}</div>`,
            iconAnchor: [14, 14],
            popupAnchor: [0, -16],
          })
        : d.markerColor === 'blue'
          ? blueDestinationIcon
          : d.markerColor === 'gray'
            ? grayDestinationIcon
            : destinationIcon
      const marker = L.marker([d.lat, d.lng], {
        icon,
      })
        .bindPopup(popup)
        .addTo(map)

      if (d.selectable && d.id && onDestinationClick) {
        marker.on('click', () => onDestinationClick(d.id!))
      }
      return marker
    })

    if (autoFitBounds && destinations.length > 0) {
      const bounds = L.latLngBounds(destinations.map((d) => [d.lat, d.lng] as L.LatLngTuple))
      map.fitBounds(bounds, { padding: [48, 48] })
    } else if ((delivererLat == null || delivererLng == null) && destinations[0]) {
      map.setView([destinations[0].lat, destinations[0].lng], map.getZoom())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations, autoFitBounds, onDestinationClick])

  // Render trail polyline + individual point markers + start/end markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    trailLayersRef.current.forEach((l) => l.remove())
    trailLayersRef.current = []

    if (trail.length < 2) return

    const latlngs = trail.map((p) => [p.lat, p.lng] as L.LatLngTuple)

    const polyline = L.polyline(latlngs, {
      color: '#3B82F6',
      weight: 3,
      opacity: 0.7,
      lineJoin: 'round',
    }).addTo(map)

    // One circle per recorded GPS point (skip first and last — covered by start/end markers)
    const dotLayers: L.Layer[] = trail.slice(1, -1).map((p) => {
      const time = p.recorded_at
        ? new Date(p.recorded_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : null
      return L.circleMarker([p.lat, p.lng], {
        radius:      4,
        color:       '#1D4ED8',
        weight:      1.5,
        opacity:     0.9,
        fillColor:   '#93C5FD',
        fillOpacity: 1,
      })
        .bindPopup(time ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`)
        .addTo(map)
    })

    const startIcon = new L.DivIcon({
      className: '',
      html: '<div style="width:12px;height:12px;border-radius:50%;background:#22C55E;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
      iconAnchor: [6, 6],
    })
    const endIcon = new L.DivIcon({
      className: '',
      html: '<div style="width:12px;height:12px;border-radius:50%;background:#EF4444;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
      iconAnchor: [6, 6],
    })

    const startPoint = trail[0]!
    const endPoint   = trail[trail.length - 1]!
    const startTime  = startPoint.recorded_at
      ? new Date(startPoint.recorded_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : ''
    const endTime    = endPoint.recorded_at
      ? new Date(endPoint.recorded_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : ''

    const startMarker = L.marker([startPoint.lat, startPoint.lng], { icon: startIcon })
      .bindPopup(`Início${startTime ? ` — ${startTime}` : ''}`)
      .addTo(map)
    const endMarker   = L.marker([endPoint.lat, endPoint.lng], { icon: endIcon })
      .bindPopup(`Último ponto${endTime ? ` — ${endTime}` : ''}`)
      .addTo(map)

    trailLayersRef.current = [polyline, ...dotLayers, startMarker, endMarker]

    map.fitBounds(polyline.getBounds(), { padding: [40, 40] })
  }, [trail])

  return (
    <div
      ref={divRef}
      style={{ height, width: '100%' }}
      className="z-0 rounded-xl"
    />
  )
}
