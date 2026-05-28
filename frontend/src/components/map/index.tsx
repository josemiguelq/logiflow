import dynamic from 'next/dynamic'
import type { MapDestination, TrailPoint, ProofMarker } from './LiveMap'

export type { MapDestination, TrailPoint, ProofMarker }
export type { ProofMarker as GMapProofMarker } from './DelivererGoogleMap'

const loading = () => (
  <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-100">
    <p className="text-sm text-gray-400">Carregando mapa...</p>
  </div>
)

export const LiveMap = dynamic(
  () => import('./LiveMap').then((m) => m.LiveMap),
  { ssr: false, loading }
)

export const DelivererGoogleMap = dynamic(
  () => import('./DelivererGoogleMap').then((m) => m.DelivererGoogleMap),
  { ssr: false, loading }
)
