import dynamic from 'next/dynamic'
import type { MapDestination, TrailPoint, ProofMarker } from './LiveMap'

export type { MapDestination, TrailPoint, ProofMarker }

export const LiveMap = dynamic(
  () => import('./LiveMap').then((m) => m.LiveMap),
  {
    ssr:     false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-100">
        <p className="text-sm text-gray-400">Carregando mapa...</p>
      </div>
    ),
  }
)
