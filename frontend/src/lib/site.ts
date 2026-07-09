// URL pública canônica do site. Usada em metadata (canonical/OG), robots e sitemap.
// Configurável por env para ambientes de preview; cai no domínio de produção.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://logiflow-app.quisbert.com.br'
).replace(/\/$/, '')
