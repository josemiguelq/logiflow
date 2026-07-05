/* LogiFlow — service worker mínimo.
 * Foco em instalabilidade (PWA), não em offline agressivo. É um app em tempo real
 * (websockets/dados ao vivo), então evitamos precache do bundle para não servir JS velho.
 * Estratégia:
 *   - navegações: network-first com fallback ao cache (última página vista);
 *   - assets estáticos same-origin: stale-while-revalidate;
 *   - cross-origin (API/WS em outra origem) e não-GET: passam direto (sem interceptar).
 */

const CACHE = 'lf-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/sounds/')
  )
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Só GET e só mesma origem — deixa a API/WS e uploads passarem intactos.
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegações: network-first, cai no cache se offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request)
          const cache = await caches.open(CACHE)
          cache.put(request, fresh.clone())
          return fresh
        } catch {
          const cached = await caches.match(request)
          return cached || caches.match('/')
        }
      })(),
    )
    return
  }

  // Assets estáticos: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(request)
        const network = fetch(request)
          .then((res) => {
            if (res && res.status === 200) cache.put(request, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      })(),
    )
  }
})
