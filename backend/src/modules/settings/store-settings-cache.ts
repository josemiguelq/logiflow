import { db } from '../../shared/db/client'
import { redis } from '../../shared/infra/redis'

// Cache em Redis (local, latência desprezível) dos valores de settings resolvidos
// por loja: mapa name → value já com COALESCE(override, default). Settings mudam
// raramente, então cacheamos até uma escrita invalidar. TTL só como rede de segurança.
const TTL = 3600 // 1h
const cacheKey = (storeId: string) => `settings:store:${storeId}`

export type StoreSettings = Record<string, string>

/**
 * Retorna todos os settings resolvidos da loja. Serve o cache do Redis; no miss,
 * faz UMA query no catálogo inteiro e popula o cache. Substitui as múltiplas
 * leituras pontuais de store_setting_values espalhadas pelas rotas.
 */
export async function getStoreSettings(storeId: string): Promise<StoreSettings> {
  try {
    const raw = await redis.get(cacheKey(storeId))
    if (raw) return JSON.parse(raw) as StoreSettings
  } catch { /* cache indisponível → cai no banco */ }

  const { rows } = await db.query(
    `SELECT s.name, COALESCE(ssv.value, s.default_value) AS value
       FROM settings s
       LEFT JOIN store_setting_values ssv
         ON ssv.setting_id = s.id AND ssv.store_id = $1`,
    [storeId]
  )
  const map: StoreSettings = {}
  for (const r of rows as Array<{ name: string; value: string }>) map[r.name] = r.value

  redis.setex(cacheKey(storeId), TTL, JSON.stringify(map)).catch(() => { /* best-effort */ })
  return map
}

// Chamar sempre que qualquer store_setting_values da loja for escrito.
export async function invalidateStoreSettings(storeId: string): Promise<void> {
  try { await redis.del(cacheKey(storeId)) } catch { /* ignore */ }
}
