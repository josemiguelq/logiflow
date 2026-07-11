import { headers } from 'next/headers'
import HomeLanding, { dictionaries, type Locale } from './_home/landing'

// Home detecta o idioma pelo Accept-Language do browser: espanhol → es, senão pt
// (padrão). A rota /es força espanhol. Ler headers torna a rota dinâmica — ok para
// a landing.
export default async function LandingPage() {
  const accept = (await headers()).get('accept-language')?.toLowerCase() ?? ''
  const first = accept.split(',')[0]?.trim() ?? ''
  const locale: Locale = first.startsWith('es') ? 'es' : 'pt'
  return <HomeLanding dict={dictionaries[locale]} locale={locale} />
}
