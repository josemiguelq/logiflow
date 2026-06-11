import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Builds the list of page buttons to show: always the first and last page, a
// window of ±1 around the current page, and 'gap' markers (…) for the rest.
function pageItems(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set<number>([1, pages])
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= pages) wanted.add(p)
  }
  const sorted = [...wanted].sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push('gap')
    result.push(p)
    prev = p
  }
  return result
}

export function Pagination({ page, pages, onChange, className }: {
  page: number
  pages: number
  onChange: (page: number) => void
  className?: string
}) {
  if (pages <= 1) return null

  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 px-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors'

  return (
    <div className={cn('mt-4 flex items-center justify-between gap-2 text-sm text-gray-500', className)}>
      <span className="hidden sm:inline">Página {page} de {pages}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          aria-label="Página anterior"
          className={btn}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageItems(page, pages).map((it, i) =>
          it === 'gap' ? (
            <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
          ) : (
            <button
              key={it}
              onClick={() => onChange(it)}
              aria-current={it === page ? 'page' : undefined}
              className={cn(btn, it === page && 'border-gray-900 bg-gray-900 text-white hover:bg-gray-900')}
            >
              {it}
            </button>
          )
        )}
        <button
          onClick={() => onChange(Math.min(pages, page + 1))}
          disabled={page === pages}
          aria-label="Próxima página"
          className={btn}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
