'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface Props {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

export default function AddressMapPicker({ lat, lng, onChange }: Props) {
  const divRef    = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const cbRef     = useRef(onChange)
  useEffect(() => { cbRef.current = onChange })

  // Mount once
  useEffect(() => {
    if (!divRef.current || mapRef.current) return

    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:22px;height:22px;border-radius:50%;
        background:#DC2626;border:3px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,.45);
        cursor:grab;
      "></div>`,
      iconSize:   [22, 22],
      iconAnchor: [11, 11],
    })

    const map = L.map(divRef.current, { zoomControl: true, attributionControl: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
    map.setView([lat, lng], 17)

    const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map)

    marker.on('dragend', () => {
      const pos = marker.getLatLng()
      cbRef.current(pos.lat, pos.lng)
    })

    map.on('click', (e) => {
      marker.setLatLng(e.latlng)
      cbRef.current(e.latlng.lat, e.latlng.lng)
    })

    mapRef.current    = map
    markerRef.current = marker

    return () => {
      map.remove()
      mapRef.current    = null
      markerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external lat/lng changes (e.g. autocomplete pick)
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return
    markerRef.current.setLatLng([lat, lng])
    mapRef.current.panTo([lat, lng])
  }, [lat, lng])

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
