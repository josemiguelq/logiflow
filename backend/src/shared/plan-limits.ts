import { DB } from './db/client'
import { redis } from './infra/redis'

/**
 * Resolução e enforcement dos limites de plano por loja, com cache no Redis.
 *
 * Limite efetivo = override da loja (se não-nulo) → valor do plano → NULL (ilimitado).
 * Override `0` = ilimitado explícito. Sem plano e sem override → tudo ilimitado.
 */

export interface StoreLimits {
  planId:            string | null
  planName:          string | null
  maxDeliverers:     number | null   // null = ilimitado
  maxOrdersPerMonth: number | null   // null = ilimitado
  featureNames:      string[]
}

const LIMITS_TTL    = 600  // s
const DELIVERERS_TTL = 600
const DELIVERED_TTL  = 300

const limitsKey     = (storeId: string) => `plan:limits:${storeId}`
const delivererKey  = (storeId: string) => `usage:deliverers:${storeId}`
const deliveredKey  = (storeId: string, ym: string) => `usage:delivered:${storeId}:${ym}`

/** Mês corrente "YYYY-MM" em America/Sao_Paulo. */
function currentMonthSP(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  }).format(new Date()) // "YYYY-MM"
}

// override (não-nulo) tem prioridade; 0 = ilimitado (vira null)
function effective(override: number | null, planValue: number | null): number | null {
  if (override != null) return override === 0 ? null : override
  return planValue
}

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  try { await redis.set(key, JSON.stringify(value), 'EX', ttl) } catch { /* ignore */ }
}

/** Limites/plano/features resolvidos para a loja (cacheado). */
export async function resolveStoreLimits(db: DB, storeId: string): Promise<StoreLimits> {
  const cached = await cacheGet<StoreLimits>(limitsKey(storeId))
  if (cached) return cached

  const { rows: [row] } = await db.query(
    `SELECT s.plan_id,
            s.max_deliverers_override,
            s.max_orders_per_month_override,
            p.name                 AS plan_name,
            p.max_deliverers       AS plan_max_deliverers,
            p.max_orders_per_month AS plan_max_orders,
            COALESCE(
              (SELECT jsonb_agg(f.name)
               FROM plan_features pf JOIN features f ON f.id = pf.feature_id
               WHERE pf.plan_id = p.id),
              '[]'::jsonb
            ) AS feature_names
     FROM stores s
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE s.id = $1`,
    [storeId]
  )

  const limits: StoreLimits = {
    planId:            (row?.plan_id as string | null) ?? null,
    planName:          (row?.plan_name as string | null) ?? null,
    maxDeliverers:     effective(
      row?.max_deliverers_override != null ? Number(row.max_deliverers_override) : null,
      row?.plan_max_deliverers != null ? Number(row.plan_max_deliverers) : null
    ),
    maxOrdersPerMonth: effective(
      row?.max_orders_per_month_override != null ? Number(row.max_orders_per_month_override) : null,
      row?.plan_max_orders != null ? Number(row.plan_max_orders) : null
    ),
    featureNames:      (row?.feature_names as string[] | null) ?? [],
  }

  await cacheSet(limitsKey(storeId), limits, LIMITS_TTL)
  return limits
}

export async function invalidateStoreLimits(storeId: string): Promise<void> {
  try { await redis.del(limitsKey(storeId)) } catch { /* ignore */ }
}

/** Nº de entregadores ativos (cacheado). */
export async function activeDelivererCount(db: DB, storeId: string): Promise<number> {
  const cached = await cacheGet<number>(delivererKey(storeId))
  if (cached != null) return cached

  const { rows: [r] } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE is_active) AS cnt FROM deliverers WHERE store_id = $1`,
    [storeId]
  )
  const count = Number(r?.cnt ?? 0)
  await cacheSet(delivererKey(storeId), count, DELIVERERS_TTL)
  return count
}

export async function invalidateDelivererCount(storeId: string): Promise<void> {
  try { await redis.del(delivererKey(storeId)) } catch { /* ignore */ }
}

/** Nº de pedidos DELIVERED no mês corrente (America/Sao_Paulo), cacheado. */
export async function monthlyDeliveredCount(db: DB, storeId: string): Promise<number> {
  const ym = currentMonthSP()
  const cached = await cacheGet<number>(deliveredKey(storeId, ym))
  if (cached != null) return cached

  const { rows: [r] } = await db.query(
    `SELECT COUNT(*) AS cnt FROM orders
     WHERE store_id = $1 AND status = 'DELIVERED' AND delivered_at IS NOT NULL
       AND date_trunc('month', delivered_at AT TIME ZONE 'America/Sao_Paulo')
         = date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))`,
    [storeId]
  )
  const count = Number(r?.cnt ?? 0)
  await cacheSet(deliveredKey(storeId, ym), count, DELIVERED_TTL)
  return count
}

/** Lança erro (403-worthy) se a loja atingiu o limite de entregadores do plano. */
export async function assertCanAddDeliverer(db: DB, storeId: string): Promise<void> {
  const { maxDeliverers } = await resolveStoreLimits(db, storeId)
  if (maxDeliverers == null) return // ilimitado

  const used = await activeDelivererCount(db, storeId)
  if (used >= maxDeliverers) {
    throw new Error(
      `Limite de entregadores do plano atingido (${maxDeliverers}). Faça upgrade do plano para adicionar mais.`
    )
  }
}
