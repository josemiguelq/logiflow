import { Skeleton } from './skeleton'

export interface TableSkeletonColumn {
  // Classe do <td> (ex.: 'hidden sm:table-cell', 'text-right') — deve casar com a
  // coluna correspondente do cabeçalho para alinhar/esconder igual.
  cell?: string
  // Largura/altura da barrinha shimmer (ex.: 'w-28'). Default 'w-full max-w-[8rem]'.
  bar?: string
}

interface Props {
  // Uma entrada por coluna do cabeçalho (na mesma ordem).
  columns: TableSkeletonColumn[]
  // Quantas linhas de shimmer renderizar. Default 8.
  rows?: number
  // Padding/base das células — case com o das linhas reais da tabela.
  // Default 'px-4 py-3'.
  cellClassName?: string
}

// Linhas de shimmer para dentro do <tbody> de uma tabela, enquanto os dados
// carregam. Mantém o <thead> real da tabela visível. Reutilizável: cada tabela
// passa suas colunas (com as mesmas classes responsivas dos headers).
export function TableSkeleton({ columns, rows = 8, cellClassName = 'px-4 py-3' }: Props) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {columns.map((col, c) => (
            <td key={c} className={`${cellClassName} ${col.cell ?? ''}`}>
              <Skeleton className={`h-4 ${col.bar ?? 'w-full max-w-[8rem]'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
