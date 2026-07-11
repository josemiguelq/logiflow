'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { MessageSquare, Wifi, WifiOff } from 'lucide-react'
import { api } from '@/lib/api'
import { useAccess } from '@/hooks/useAccess'
import { WhatsappNotifySection } from './_notify_section'

const ACCESS = { scope: 'whatsapp:view', feature: 'whatsapp' } as const

export default function WhatsAppPage() {
  const { can, isLoading } = useAccess()
  const router = useRouter()

  const allowed = can(ACCESS)

  const { data: statusData } = useSWR<{ status: string; central?: boolean }>(
    allowed ? '/whatsapp/status' : null,
    (url: string) => api.get<{ status: string; central?: boolean }>(url),
    { refreshInterval: 30_000 }
  )

  useEffect(() => {
    if (isLoading) return
    if (!allowed) router.replace('/orders')
  }, [isLoading, allowed, router])

  if (isLoading || !allowed) return null

  const active = (statusData?.status ?? 'DISCONNECTED') === 'CONNECTED'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
        <p className="text-sm text-gray-500">Notificações automáticas para clientes</p>
      </div>

      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              active ? 'bg-green-100' : 'bg-gray-100'
            }`}>
              <MessageSquare className={`h-7 w-7 ${active ? 'text-green-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="font-semibold text-gray-900">WhatsApp da LogiFlow</p>
              <div className="flex items-center gap-1.5">
                {active
                  ? <Wifi className="h-3.5 w-3.5 text-green-500" />
                  : <WifiOff className="h-3.5 w-3.5 text-gray-400" />}
                <span className={`text-sm ${active ? 'text-green-600' : 'text-gray-400'}`}>
                  {active ? 'Ativo — número oficial da LogiFlow' : 'Temporariamente indisponível'}
                </span>
              </div>
            </div>
          </div>

          {!active && (
            <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
              O envio de mensagens está indisponível no momento. Se persistir, fale com o suporte.
            </p>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
          <p className="font-medium">Como funciona:</p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-blue-600">
            <li>As mensagens saem pelo número oficial da LogiFlow — nada para conectar</li>
            <li>O cliente é avisado automaticamente a cada mudança de status do pedido</li>
            <li>A mensagem inclui o nome da sua loja, link de rastreamento e código de confirmação</li>
          </ul>
        </div>

        <div className="mt-6">
          <WhatsappNotifySection />
        </div>
      </div>
    </div>
  )
}
