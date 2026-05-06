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

const selectedDestinationIcon = new L.Icon({
  iconUrl:    'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
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
}

interface Props {
  delivererLat?: number | null
  delivererLng?: number | null
  delivererName?: string
  destinations?: MapDestination[]
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
  height = '100%',
  autoFitBounds = false,
  onDestinationClick,
}: Props) {
  const divRef              = useRef<HTMLDivElement>(null)
  const mapRef              = useRef<L.Map | null>(null)
  const delivererMarkerRef  = useRef<L.Marker | null>(null)
  const destMarkersRef      = useRef<L.Marker[]>([])

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
      const marker = L.marker([d.lat, d.lng], {
        icon: d.selected ? selectedDestinationIcon : destinationIcon,
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

  return (
    <div
      ref={divRef}
      style={{ height, width: '100%' }}
      className="z-0 rounded-xl"
    />
  )
}
