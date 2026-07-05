'use client'

import { useEffect } from 'react'

// Registra o service worker (/sw.js) para habilitar a instalação do PWA.
// Só em produção — em `next dev` o SW pode atrapalhar o HMR/cache.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* registro best-effort — falha não é fatal */
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])

  return null
}
