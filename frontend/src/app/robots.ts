import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Só a landing (/) e as páginas legais (/privacidade, /termos) devem ser
// indexadas. Todo o resto — painel do operador, super-admin, auth, links de
// rastreio por token e o manifest — fica bloqueado para os crawlers.
//
// Obs.: o grupo de rotas (dashboard) não adiciona segmento na URL, então suas
// páginas ficam na raiz (/orders, /customers, …) e precisam ser listadas uma a uma.
const PRIVATE_PATHS = [
  '/login',
  '/cadastro',
  '/super-admin',
  '/rastreio',
  '/tracking',
  '/g',
  '/pwa-manifest',
  // (dashboard) — servidas na raiz
  '/all-orders',
  '/analytics',
  '/announcements',
  '/customers',
  '/deliverers',
  '/garantias',
  '/goals',
  '/orders',
  '/perfil',
  '/routes',
  '/settings',
  '/users',
  '/whatsapp',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/privacidade', '/termos'],
      disallow: PRIVATE_PATHS,
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
