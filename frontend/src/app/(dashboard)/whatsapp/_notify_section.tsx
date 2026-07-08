'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { Save, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'
import { Button } from '@/components/ui/button'

interface NotifySettings {
  whatsappNotifyStatuses: string[]
}

const WHATSAPP_STATUS_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'PREPARING',        label: 'Pedido criado',        desc: 'Quando o pedido é registrado' },
  { value: 'ON_ROUTE',         label: 'Em rota',              desc: 'Quando o entregador retira os pedidos da rota' },
  { value: 'OUT_FOR_DELIVERY', label: 'Saiu para entrega',    desc: 'Quando o pedido é a próxima parada' },
  { value: 'ARRIVING',         label: 'Chegando ao endereço', desc: 'Quando o entregador entra no raio de chegada — avisa o cliente para se preparar para receber' },
  { value: 'DELIVERED',        label: 'Entregue',             desc: 'Quando a entrega é concluída' },
  { value: 'CANCELLED',        label: 'Cancelado',            desc: 'Quando o pedido é cancelado' },
  { value: 'ADDRESS_CHANGED',  label: 'Endereço alterado',    desc: 'Quando o endereço de entrega muda' },
]

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
          <MessageCircle className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-semibold text-gray-900">Notificações por WhatsApp</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export function WhatsappNotifySection({ onSaved }: { onSaved?: () => void }) {
  const { data, mutate } = useSWR<NotifySettings>(
    '/store/settings',
    (u: string) => api.get<NotifySettings>(u)
  )
  const features = useStoreFeatures()

  const [statuses, setStatuses] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)

  useEffect(() => {
    if (data) setStatuses(data.whatsappNotifyStatuses ?? [])
  }, [data])

  function toggle(value: string) {
    setStatuses((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    )
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      await api.patch('/store/settings', { whatsappNotifyStatuses: statuses })
      mutate()
      onSaved?.()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Escolha quais mudanças de status enviam uma mensagem automática ao cliente.
        </p>

        {!features.whatsappEnabled && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            O WhatsApp não está habilitado para sua loja. Estas opções só terão efeito após a ativação.
          </p>
        )}

        {WHATSAPP_STATUS_OPTIONS.map(({ value, label, desc }) => {
          const on = statuses.includes(value)
          return (
            <div key={value} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <button
                type="button"
                onClick={() => toggle(value)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                style={{ background: on ? 'var(--color-primary)' : '#E5E7EB' }}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    on ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )
        })}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {loading ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar notificações'}
        </Button>
      </div>
    </Card>
  )
}
