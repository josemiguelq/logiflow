'use client'

import { use } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, MapPin, Clock, Wifi, WifiOff, Truck, Star } from 'lucide-react'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface StatusEntry {
  status:    string
  lat:       number | null
  lng:       number | null
  changedAt: string
}

interface DelivererDetail {
  id:              string
  name:            string
  username:        string
  email:           string | null
  status:          string
  profileImageUrl: string | null
  isActive:        boolean
  createdAt:       string
  avgRating:       number | null
  ratingCount:     number
  history:         StatusEntry[]
}

const STATUS_STYLE: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  AVAILABLE: {
    label: 'Disponível',
    icon:  <Wifi className="h-4 w-4" />,
    color: 'text-green-700',
    bg:    'bg-green-50 border-green-200',
  },
  ON_ROUTE: {
    label: 'Em rota',
    icon:  <Truck className="h-4 w-4" />,
    color: 'text-orange-700',
    bg:    'bg-orange-50 border-orange-200',
  },
  OFFLINE: {
    label: 'Offline',
    icon:  <WifiOff className="h-4 w-4" />,
    color: 'text-gray-600',
    bg:    'bg-gray-100 border-gray-200',
  },
}

function StatusBadgeInline({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.OFFLINE
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.color} ${s.bg}`}>
      {s.icon}
      {s.label}
    </span>
  )
}

export default function DelivererDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const isAdmin = user?.role === 'OWNER' || user?.role === 'MANAGER'

  const { data, isLoading } = useSWR<DelivererDetail>(
    `/deliverers/${id}/history`,
    (url: string) => api.get<DelivererDetail>(url)
  )

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  if (!data) return <div className="p-6 text-gray-500">Entregador não encontrado</div>

  const currentStyle = STATUS_STYLE[data.status] ?? STATUS_STYLE.OFFLINE

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Link
        href="/deliverers"
        className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para entregadores
      </Link>

      {/* Profile card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          {data.profileImageUrl ? (
            <img
              src={data.profileImageUrl}
              alt={data.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl font-bold text-gray-400">
              {data.name[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
            <p className="text-sm text-gray-500">@{data.username}</p>
            {data.email && <p className="text-sm text-gray-500">{data.email}</p>}
            {isAdmin && data.ratingCount > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-1">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-semibold text-yellow-700">
                  {data.avgRating?.toFixed(1)}
                </span>
                <span className="text-xs text-yellow-600">
                  ({data.ratingCount} {data.ratingCount === 1 ? 'avaliação' : 'avaliações'})
                </span>
              </div>
            )}
            {isAdmin && data.ratingCount === 0 && (
              <p className="mt-2 text-xs text-gray-400">Sem avaliações ainda</p>
            )}
          </div>
          <StatusBadgeInline status={data.status} />
        </div>
      </div>

      {/* Status history */}
      <div className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Histórico de Status
        </h2>

        {data.history.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            Nenhuma mudança de status registrada ainda
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="divide-y divide-gray-100">
              {data.history.map((entry, i) => {
                const s = STATUS_STYLE[entry.status] ?? STATUS_STYLE.OFFLINE
                const mapsUrl = entry.lat != null && entry.lng != null
                  ? `https://www.google.com/maps?q=${entry.lat},${entry.lng}`
                  : null
                return (
                  <div key={i} className="flex items-start gap-4 px-5 py-4">
                    <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${s.bg} ${s.color}`}>
                      {s.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${s.color}`}>{s.label}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(entry.changedAt)}
                        </span>
                        {mapsUrl ? (
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:underline"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            <MapPin className="h-3 w-3" />
                            {entry.lat!.toFixed(5)}, {entry.lng!.toFixed(5)}
                          </a>
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400">
                            <MapPin className="h-3 w-3" />
                            Localização não capturada
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
