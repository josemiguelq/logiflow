// Integração leve com o agente New Relic para enriquecer as transações com
// contexto do ator (entregador / operador / super admin).
//
// O agente só é pré-carregado em produção via `-r newrelic` (ver package.json).
// Em dev (tsx) ele NÃO é carregado — então acessamos o agente apenas se ele já
// estiver no require.cache, evitando inicializá-lo por engano. Tudo é
// best-effort: qualquer falha aqui nunca pode quebrar um request.

type NewRelicApi = {
  addCustomAttributes: (atts: Record<string, string | number | boolean>) => void
}

let cached: NewRelicApi | null | undefined

function agent(): NewRelicApi | null {
  if (cached !== undefined) return cached
  try {
    const resolved = require.resolve('newrelic')
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require.cache[resolved] ? (require('newrelic') as NewRelicApi) : null
  } catch {
    cached = null
  }
  return cached
}

type Actor = {
  type:    'store_user' | 'deliverer' | 'super_admin'
  sub:     string
  storeId: string
  role?:   string
}

// Anexa o ator à transação atual do New Relic. As chaves ficam consultáveis em
// NRQL, ex.: SELECT * FROM Transaction WHERE actor.id = '...'.
export function addActorContext(actor: Actor): void {
  const nr = agent()
  if (!nr) return
  try {
    nr.addCustomAttributes({
      'actor.type':    actor.type,
      'actor.id':      actor.sub,
      'actor.storeId': actor.storeId,
      ...(actor.role ? { 'actor.role': actor.role } : {}),
    })
  } catch {
    /* non-fatal */
  }
}
