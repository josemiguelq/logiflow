'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, MessageSquare, Check, Clock, AlertCircle } from 'lucide-react'
import { OrderMessage } from '@/types'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

const STATUS_META: Record<OrderMessage['status'], { label: string; className: string; Icon: typeof Check }> = {
  SENT:    { label: 'Enviado',  className: 'text-green-600', Icon: Check },
  PENDING: { label: 'Enviando', className: 'text-gray-400',  Icon: Clock },
  FAILED:  { label: 'Falhou',   className: 'text-red-500',   Icon: AlertCircle },
}

// Painel colapsável que mostra, em formato de chat, as mensagens (WhatsApp)
// enviadas ao cliente deste pedido. Busca sob demanda ao expandir.
export function OrderMessages({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false)
  const { data: messages, isLoading } = useSWR<OrderMessage[]>(
    open ? `/orders/${orderId}/messages` : null,
    (url: string) => api.get<OrderMessage[]>(url)
  )

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Mensagens
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-2 bg-gray-50 px-4 py-3">
          {isLoading ? (
            <p className="text-center text-xs text-gray-400">Carregando…</p>
          ) : !messages || messages.length === 0 ? (
            <p className="text-center text-xs text-gray-400">Nenhuma mensagem enviada ao cliente</p>
          ) : (
            messages.map((m) => {
              const st = STATUS_META[m.status]
              return (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-green-100 px-3 py-2 text-sm text-gray-800 shadow-sm">
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
                    <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-gray-500">
                      <span>{formatDate(m.createdAt)}</span>
                      <span className={`flex items-center gap-0.5 ${st.className}`}>
                        <st.Icon className="h-3 w-3" />
                        {st.label}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
