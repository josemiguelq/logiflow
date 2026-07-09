'use client'

import useSWR from 'swr'
import { ChatMessage } from '@/types'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'

interface Props {
  orderId: string
}

// Histórico read-only da conversa do pedido, exibido nos detalhes.
export function OrderChatHistory({ orderId }: Props) {
  const { data: messages = [] } = useSWR<ChatMessage[]>(
    `/orders/${orderId}/chat`,
    (u: string) => api.get<ChatMessage[]>(u),
  )

  if (messages.length === 0) {
    return <p className="text-sm text-gray-400">Nenhuma mensagem trocada.</p>
  }

  return (
    <div className="space-y-2">
      {messages.map((m) => {
        const isStore = m.senderType === 'store_user'
        return (
          <div key={m.id} className={`flex ${isStore ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                isStore
                  ? 'rounded-br-sm bg-blue-600 text-white'
                  : 'rounded-bl-sm border border-gray-200 bg-white text-gray-800'
              }`}
            >
              <p className={`mb-0.5 text-[11px] font-medium ${isStore ? 'text-blue-100' : 'text-gray-500'}`}>
                {isStore ? m.senderName : `🛵 ${m.senderName}`}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`mt-1 text-right text-[10px] ${isStore ? 'text-blue-200' : 'text-gray-400'}`}>
                {formatDate(m.createdAt)}
              </p>
              {!isStore && m.reads.length > 0 && (
                <p
                  className="mt-0.5 text-[10px] text-gray-400"
                  title={m.reads.map((r) => `${r.storeUserName} — ${formatDate(r.readAt)}`).join('\n')}
                >
                  ✓ Lido por {m.reads.map((r) => r.storeUserName).join(', ')}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
