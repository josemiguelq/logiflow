'use client'

import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  loading:       boolean
  error?:        unknown
  empty?:        boolean
  emptyIcon?:    React.ElementType
  emptyMessage?: string
  height?:       number
  children:      ReactNode
}

// Padroniza os 4 estados exigidos por widget (loading/erro/vazio/conteúdo)
// para não repetir o mesmo ternário em cada gráfico/tabela da página.
export function WidgetFrame({
  loading, error, empty, emptyIcon: EmptyIcon, emptyMessage = 'Nenhum dado no período', height = 220, children,
}: Props) {
  if (loading) {
    return (
      <div style={{ height }}>
        <Skeleton className="h-full w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    const detail = error instanceof Error ? error.message : null
    return (
      <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        Não foi possível carregar estes dados agora.
        {detail && <span className="block text-xs text-red-400">{detail}</span>}
      </div>
    )
  }

  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        {EmptyIcon && <EmptyIcon className="mb-2 h-8 w-8" />}
        <p className="text-sm">{emptyMessage}</p>
      </div>
    )
  }

  return <>{children}</>
}
