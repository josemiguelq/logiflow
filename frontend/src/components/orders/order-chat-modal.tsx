'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { X, Send, MessageCircle } from 'lucide-react'
import { Order, ChatMessage } from '@/types'
import { api } from '@/lib/api'
import { useWs } from '@/hooks/WsContext'
import { formatDate } from '@/lib/utils'

interface Props {
  order: Order
  onClose: () => void
  // Chamado depois de marcar as mensagens como lidas (para atualizar o badge).
  onRead?: () => void
}

export function OrderChatModal({ order, onClose, onRead }: Props) {
  const { on } = useWs()
  const url = `/orders/${order.id}/chat`
  const { data: messages = [], mutate } = useSWR<ChatMessage[]>(
    url,
    (u: string) => api.get<ChatMessage[]>(u),
  )
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const markRead = useCallback(() => {
    api.post(`/orders/${order.id}/chat/read`, {})
      .then(() => onRead?.())
      .catch(() => { /* non-fatal */ })
  }, [order.id, onRead])

  // Marca como lido ao abrir.
  useEffect(() => { markRead() }, [markRead])

  // Novas mensagens deste pedido em tempo real → recarrega e marca lido.
  useEffect(
    () => on('order_message', (data) => {
      const msg = data as ChatMessage
      if (msg.orderId !== order.id) return
      mutate()
      if (msg.senderType === 'deliverer') markRead()
    }),
    [on, order.id, mutate, markRead],
  )

  // Rola para a última mensagem.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  // Sem entregador atribuído não há para quem enviar — bloqueia o envio.
  const hasDeliverer = Boolean(order.deliverer)

  async function handleSend() {
    const body = text.trim()
    if (!body || sending || !hasDeliverer) return
    setSending(true)
    try {
      await api.post<ChatMessage>(url, { body })
      setText('')
      await mutate()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-4 sm:items-center">
      <div className="flex h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100">
              <MessageCircle className="h-4.5 w-4.5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Chat — #{order.id.slice(-8).toUpperCase()}
              </h2>
              <p className="text-xs text-gray-500">
                {order.deliverer?.name ?? order.customer.name}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 space-y-2 overflow-y-auto bg-gray-50 px-3 py-4">
          {messages.length === 0 ? (
            <p className="mt-8 text-center text-sm text-gray-400">
              Nenhuma mensagem ainda. Envie a primeira.
            </p>
          ) : (
            messages.map((m) => {
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
            })
          )}
        </div>

        {/* Composer */}
        {hasDeliverer ? (
          <div className="flex items-end gap-2 border-t border-gray-100 p-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Escreva uma mensagem…"
              className="max-h-28 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <p className="border-t border-gray-100 px-4 py-3 text-center text-xs text-gray-500">
            Atribua um entregador ao pedido para conversar.
          </p>
        )}
      </div>
    </div>
  )
}
