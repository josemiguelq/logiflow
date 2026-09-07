// Fetcher local ao Analítico (não reaproveita `@/lib/api`) só para conseguir
// mostrar o `message` real de erros 500/400 nos widgets — o `api.ts`
// compartilhado descarta esse campo e usa apenas o rótulo genérico `error`
// (ex.: "Internal Server Error"), o que não ajuda a diagnosticar falhas
// específicas de uma query. Mantém as outras chamadas da página (useAccess,
// useStoreFeatures, tema) em `api.ts` normalmente — só os widgets de dados
// usam este fetcher.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export async function analyticsFetcher<T>(path: string): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('logiflow_token') : null
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.message ?? body.error ?? res.statusText ?? 'Request failed'
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  if (res.status === 204) return null as T
  return res.json()
}
