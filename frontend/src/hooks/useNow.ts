'use client'

import { useEffect, useState } from 'react'

/**
 * Retorna `Date.now()` re-renderizando o componente a cada `intervalMs`.
 * Usado para recalcular bandeiras de atraso conforme o tempo passa, mesmo
 * sem novo fetch de dados.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
