'use client'

import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title:    string
  onClose:  () => void
  children: ReactNode
}

// Overlay simples (mesmo padrão já usado no projeto, ex. DeleteRouteModal em
// routes/page.tsx) — o Radix Dialog está instalado mas não é usado em
// nenhuma tela hoje, então não introduzimos um segundo padrão de modal aqui.
export function Modal({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
