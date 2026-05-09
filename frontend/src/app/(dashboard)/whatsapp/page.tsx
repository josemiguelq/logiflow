'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { MessageSquare, Wifi, WifiOff, QrCode, Power } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

interface StoreFeatures {
  whatsappEnabled:    boolean
  customThemeEnabled: boolean
  csvExportEnabled:   boolean
}

export default function WhatsAppPage() {
  const { user, hasScope } = useAuth()
  const router = useRouter()

  // Same SWR key as useStoreFeatures → served from cache, no extra request
  const { data: features } = useSWR<StoreFeatures>(
    '/store/features',
    (url: string) => api.get<StoreFeatures>(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // All hooks must be at the top — before any conditional returns
  const [loading, setLoading] = useState(false)
  const [qrData,  setQrData]  = useState<string | null>(null)

  const allowed = !!user && hasScope('whatsapp:view') && features?.whatsappEnabled === true

  const { data: statusData, mutate } = useSWR<{ status: string }>(
    allowed ? '/whatsapp/status' : null,   // only fetch when allowed
    (url: string) => api.get<{ status: string }>(url),
    { refreshInterval: 5_000 }
  )

  useEffect(() => {
    if (!user) return
    // Scope check is instant (JWT payload already in memory)
    if (!hasScope('whatsapp:view')) { router.replace('/orders'); return }
    // Feature check once the API response arrives
    if (features !== undefined && !features.whatsappEnabled) {
      router.replace('/orders')
    }
  }, [user, features, hasScope, router])

  // Hold render until both checks pass — prevents any flash of content
  if (!user || features === undefined || !allowed) return null

  async function handleConnect() {
    setLoading(true)
    try {
      const res = await api.post<{ status: string; qrCode?: string }>('/whatsapp/connect', {})
      if (res.qrCode) setQrData(res.qrCode)
      mutate()
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect() {
    setLoading(true)
    try {
      await api.post('/whatsapp/disconnect', {})
      setQrData(null)
      mutate()
    } finally {
      setLoading(false)
    }
  }

  const status = statusData?.status ?? 'DISCONNECTED'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
        <p className="text-sm text-gray-500">Notificações automáticas para clientes</p>
      </div>

      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              status === 'CONNECTED'  ? 'bg-green-100' :
              status === 'CONNECTING' ? 'bg-yellow-100' : 'bg-gray-100'
            }`}>
              <MessageSquare className={`h-7 w-7 ${
                status === 'CONNECTED'  ? 'text-green-600' :
                status === 'CONNECTING' ? 'text-yellow-600' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Sessão WhatsApp</p>
              <div className="flex items-center gap-1.5">
                {status === 'CONNECTED'    && <Wifi    className="h-3.5 w-3.5 text-green-500"  />}
                {status === 'CONNECTING'   && <Wifi    className="h-3.5 w-3.5 text-yellow-500" />}
                {status === 'DISCONNECTED' && <WifiOff className="h-3.5 w-3.5 text-gray-400"   />}
                <span className={`text-sm ${
                  status === 'CONNECTED'  ? 'text-green-600' :
                  status === 'CONNECTING' ? 'text-yellow-600' : 'text-gray-400'
                }`}>
                  {status === 'CONNECTED'  ? 'Conectado' :
                   status === 'CONNECTING' ? 'Aguardando QR' : 'Desconectado'}
                </span>
              </div>
            </div>
          </div>

          {qrData && status !== 'CONNECTED' && (
            <div className="mb-6 flex flex-col items-center rounded-xl bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">
                Escaneie o QR Code com seu WhatsApp
              </p>
              <img src={qrData} alt="QR Code" className="h-48 w-48 rounded-lg" />
              <p className="mt-2 text-xs text-gray-400">
                WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
              </p>
            </div>
          )}

          <div className="flex gap-3">
            {status !== 'CONNECTED' ? (
              <Button className="flex-1" onClick={handleConnect} disabled={loading}>
                <QrCode className="h-4 w-4" />
                {loading ? 'Conectando...' : 'Conectar WhatsApp'}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={handleDisconnect}
                disabled={loading}
              >
                <Power className="h-4 w-4" />
                Desconectar
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          <p className="font-medium">Como funciona:</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-blue-600">
            <li>Ao criar um pedido, o cliente recebe automaticamente uma mensagem</li>
            <li>A mensagem inclui link de rastreamento e código de confirmação</li>
            <li>1 sessão por loja</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
