'use client'

import { useEffect, useRef } from 'react'

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

function loadGoogleMaps(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gmaps-script')
    if (existing) {
      existing.addEventListener('load', () => resolve())
      return
    }
    const script = document.createElement('script')
    script.id    = 'gmaps-script'
    script.src   = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}`
    script.async = true
    script.onload  = () => resolve()
    script.onerror = reject
    document.head.appendChild(script)
  })
}

interface Props {
  lat: number
  lng: number
  onChange: (lat: number, lng: number) => void
}

export default function AddressMapPicker({ lat, lng, onChange }: Props) {
  const divRef    = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const cbRef     = useRef(onChange)
  useEffect(() => { cbRef.current = onChange })

  useEffect(() => {
    let cancelled = false

    loadGoogleMaps().then(() => {
      if (cancelled || !divRef.current) return

      const center = { lat, lng }

      const map = new google.maps.Map(divRef.current, {
        center,
        zoom: 17,
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
      })

      const marker = new google.maps.Marker({
        position: center,
        map,
        draggable: true,
      })

      marker.addListener('dragend', () => {
        const pos = marker.getPosition()
        if (pos) cbRef.current(pos.lat(), pos.lng())
      })

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return
        marker.setPosition(e.latLng)
        cbRef.current(e.latLng.lat(), e.latLng.lng())
      })

      mapRef.current    = map
      markerRef.current = marker
    })

    return () => {
      cancelled = true
      markerRef.current?.setMap(null)
      mapRef.current    = null
      markerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync quando lat/lng muda externamente (ex: autocomplete pick)
  useEffect(() => {
    if (!markerRef.current || !mapRef.current) return
    const pos = { lat, lng }
    markerRef.current.setPosition(pos)
    mapRef.current.panTo(pos)
  }, [lat, lng])

  return <div ref={divRef} style={{ width: '100%', height: '100%' }} />
}
