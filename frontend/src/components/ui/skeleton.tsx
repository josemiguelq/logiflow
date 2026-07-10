// Placeholder de carregamento com brilho passando (estilo Nubank).
// Defina tamanho/forma via className, ex.: <Skeleton className="h-5 w-28 rounded-full" />.
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton inline-block rounded-md ${className}`} />
}
