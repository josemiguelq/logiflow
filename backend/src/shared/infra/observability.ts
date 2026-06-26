// Integração leve com o agente New Relic para enriquecer as transações com
// contexto do ator (entregador / operador / super admin).
//
// O agente só é pré-carregado em produção via `-r newrelic` (ver package.json).
// Em dev (tsx) ele NÃO é carregado — então acessamos o agente apenas se ele já
// estiver no require.cache, evitando inicializá-lo por engano. Tudo é
// best-effort: qualquer falha aqui nunca pode quebrar um request.

type NewRelicApi = {
  addCustomAttributes: (atts: Record<string, string | number | boolean>) => void
  recordCustomEvent: (eventType: string, atts: Record<string, string | number | boolean>) => void
  noticeError: (error: Error, customAttributes?: Record<string, string | number | boolean>) => void
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

// Reporta um erro ao New Relic com o stack trace real e atributos extras
// (correlationId, rota, statusCode). Assim, em vez de um genérico "HttpError 409",
// o erro aparece com mensagem + stack + contexto em Errors Inbox / NRQL.
// Best-effort: nunca lança.
export function noticeError(
  error: Error,
  attributes?: Record<string, string | number | boolean>,
): void {
  const nr = agent()
  if (!nr) return
  try {
    nr.noticeError(error, attributes)
  } catch {
    /* non-fatal */
  }
}

// Registra um evento custom no New Relic, consultável em NRQL pelo eventType.
// Ex.: para desconexões do WhatsApp → SELECT * FROM WhatsAppDisconnect SINCE 1 day ago.
// Best-effort: nunca lança (não pode quebrar o fluxo que o chamou).
export function recordCustomEvent(
  eventType: string,
  attributes: Record<string, string | number | boolean>,
): void {
  const nr = agent()
  if (!nr) return
  try {
    nr.recordCustomEvent(eventType, attributes)
  } catch {
    /* non-fatal */
  }
}

// Anexa o Correlation-Id (vindo do header do cliente) à transação atual do
// New Relic. Consultável em NRQL: SELECT * FROM Transaction WHERE correlationId = '...'.
export function addCorrelationId(correlationId: string): void {
  const nr = agent()
  if (!nr) return
  try {
    nr.addCustomAttributes({ correlationId })
  } catch {
    /* non-fatal */
  }
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
