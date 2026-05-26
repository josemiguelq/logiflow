'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Order } from '@/types'
import { StatusBadge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { MapPin, Phone, Truck, Clock, Navigation, Share2, Check, FileText, Pencil, X, Trash2 } from 'lucide-react'

interface Props {
  order: Order
  onAssign?: () => void
  onCancel?: () => void
  onSaveNote?: (note: string) => Promise<void>
  onDelete?: () => void
}

export function OrderCard({ order, onAssign, onCancel, onSaveNote, onDelete }: Props) {
  const canTrack = ['ON_ROUTE', 'OUT_FOR_DELIVERY', 'ASSIGNED'].includes(order.status)
  const [copied,      setCopied]      = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteValue,   setNoteValue]   = useState(order.notes ?? '')
  const [savingNote,  setSavingNote]  = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNoteValue(order.notes ?? '')
  }, [order.notes])

  useEffect(() => {
    if (editingNote) textareaRef.current?.focus()
  }, [editingNote])

  function handleShare() {
    const url = `${window.location.origin}/rastreio/${order.id}`
    if (navigator.share) {
      navigator.share({ title: `Rastreio do pedido #${order.id.slice(-8).toUpperCase()}`, url }).catch(() => {})
    } else {
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  async function handleSaveNote() {
    if (!onSaveNote) return
    setSavingNote(true)
    try {
      await onSaveNote(noteValue)
      setEditingNote(false)
    } finally {
      setSavingNote(false)
    }
  }

  function handleCancelEdit() {
    setNoteValue(order.notes ?? '')
    setEditingNote(false)
  }

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div>
          <Link
            href={`/orders/${order.id}`}
            className="font-semibold text-gray-900 hover:underline"
            style={{ color: 'inherit' }}
          >
            #{order.id.slice(-8).toUpperCase()}
          </Link>
          <p className="text-sm text-gray-500">{order.customer.name}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Info */}
      <div className="space-y-1.5 px-4 pb-3 text-sm text-gray-600">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="line-clamp-1">{order.customer.address}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>{order.customer.phone}</span>
        </div>
        {order.deliverer && (
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>{order.deliverer.name}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>{formatDate(order.createdAt)}</span>
        </div>

        {/* Note — editable when onSaveNote is provided */}
        {(order.notes || onSaveNote) && (
          <div className="rounded-lg bg-amber-50 px-2.5 py-1.5">
            {editingNote ? (
              <div className="space-y-1.5">
                <textarea
                  ref={textareaRef}
                  value={noteValue}
                  onChange={e => setNoteValue(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Adicionar observação..."
                  className="w-full resize-none rounded-md border border-amber-200 bg-white px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNote()
                    if (e.key === 'Escape') handleCancelEdit()
                  }}
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={handleCancelEdit}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-500 hover:bg-amber-100"
                  >
                    <X className="h-3 w-3" />
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Check className="h-3 w-3" />
                    {savingNote ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="flex-1 text-xs text-amber-800 line-clamp-2">
                  {order.notes || <span className="italic text-amber-600">Sem observações</span>}
                </span>
                {onSaveNote && (
                  <button
                    onClick={() => setEditingNote(true)}
                    className="ml-1 shrink-0 rounded p-0.5 text-amber-400 hover:bg-amber-100 hover:text-amber-600"
                    title="Editar observação"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="mt-auto border-t border-gray-100 p-3 flex gap-2">
        {canTrack && (
          <Link
            href={`/tracking/${order.id}`}
            target="_blank"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            Rastrear
          </Link>
        )}

        <button
          onClick={handleShare}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors"
          style={copied ? { borderColor: '#86efac', color: '#16a34a', background: '#f0fdf4' } : { color: '#4B5563' }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
          {copied ? 'Copiado!' : 'Compartilhar'}
        </button>

        {onAssign && order.status === 'PREPARING' && (
          <button
            onClick={onAssign}
            className="flex flex-1 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}
          >
            Atribuir
          </button>
        )}

        {onCancel && !['DELIVERED', 'CANCELLED'].includes(order.status) && (
          <button
            onClick={onCancel}
            className="flex flex-1 items-center justify-center rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Cancelar
          </button>
        )}

        {['DELIVERED', 'CANCELLED'].includes(order.status) && !canTrack && (
          <Link
            href={`/orders/${order.id}`}
            className="flex flex-1 items-center justify-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Ver detalhes
          </Link>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            className="flex items-center justify-center rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
            title="Excluir pedido"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
