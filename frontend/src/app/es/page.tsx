import type { Metadata } from 'next'
import HomeLanding, { dictionaries } from '../_home/landing'

// Rota /es — landing sempre em espanhol.
export const metadata: Metadata = {
  title: 'LogiFlow — Gestión de entregas y logística urbana',
  description:
    'LogiFlow es la plataforma de gestión de entregas y logística urbana: pedidos, rutas, rastreo GPS en vivo y confirmación de entrega para tu tienda.',
  alternates: {
    canonical: '/es',
    languages: { 'pt-BR': '/', es: '/es' },
  },
  openGraph: {
    title: 'LogiFlow — Gestión de entregas y logística urbana',
    description:
      'La plataforma de gestión de entregas y logística urbana para tu tienda: pedidos, rutas, rastreo GPS en vivo y confirmación de entrega.',
    locale: 'es_ES',
  },
}

export default function EsLandingPage() {
  return <HomeLanding dict={dictionaries.es} locale="es" />
}
