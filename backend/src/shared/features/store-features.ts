import { db } from '../db/client'
import { redis } from '../infra/redis'

// Cache das features habilitadas por loja (store_features_enabled). Consultado em
// todo request que passa por requireFeature (ex.: /orders/chat/unread) e no
// GET /store/features — sem cache era um JOIN por request. Invalidação explícita
// quando o superadmin liga/desliga feature ou troca o plano; o TTL é só rede de
// segurança.
const key = (storeId: string) => `store:features:${storeId}`
const TTL_SECONDS = 300

// Nomes das features habilitadas para a loja (com cache Redis + fallback ao DB).
export async function getEnabledFeatures(storeId: string): Promise<string[]> {
  try {
    const cached = await redis.get(key(storeId))
    if (cached) return JSON.parse(cached) as string[]
  } catch { /* redis indisponível → cai no DB */ }

  const { rows } = await db.query(
    `SELECT f.name FROM store_features_enabled sfe
     JOIN features f ON f.id = sfe.feature_id
     WHERE sfe.store_id = $1`,
    [storeId],
  )
  const names = rows.map((r: Record<string, unknown>) => r.name as string)
  redis.setex(key(storeId), TTL_SECONDS, JSON.stringify(names)).catch(() => { /* best-effort */ })
  return names
}

export async function storeHasFeature(storeId: string, name: string): Promise<boolean> {
  return (await getEnabledFeatures(storeId)).includes(name)
}

// Invalidar quando o conjunto de features da loja muda (superadmin/plano).
export async function invalidateStoreFeatures(storeId: string): Promise<void> {
  await redis.del(key(storeId)).catch(() => { /* best-effort */ })
}
