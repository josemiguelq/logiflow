import { DB } from './db/client'

/**
 * Throws a 402-worthy error if the store is not allowed to create new orders.
 *
 * Rules:
 *  1. In trial  (today <= trial_ends_at)                → allowed
 *  2. Post-trial, last billing date not yet reached      → allowed
 *  3. Post-trial, within 7-day grace after billing date  → allowed
 *  4. Post-trial, paid for the required month            → allowed
 *  5. Otherwise                                          → throw
 */
export async function assertCanCreateOrder(db: DB, storeId: string): Promise<void> {
  const { rows: [store] } = await db.query(
    'SELECT trial_ends_at, billing_day FROM stores WHERE id = $1',
    [storeId]
  )
  if (!store) return

  const trialEndsAt  = store.trial_ends_at ? new Date(store.trial_ends_at as string) : null
  const billingDay   = (store.billing_day as number | null) ?? 1

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Rule 1 — in trial
  if (trialEndsAt && today <= trialEndsAt) return

  // No trial configured at all — skip check
  if (!trialEndsAt) return

  // Most recent billing date that has already passed
  const todayDay = today.getDate()
  const lastBillingDate = todayDay >= billingDay
    ? new Date(today.getFullYear(), today.getMonth(), billingDay)
    : new Date(today.getFullYear(), today.getMonth() - 1, billingDay)

  // Rule 2 — billing date hasn't occurred yet since trial ended
  if (lastBillingDate <= trialEndsAt) return

  // Rule 3 — within 7-day grace period
  const gracePeriodEnd = new Date(lastBillingDate)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)
  if (today <= gracePeriodEnd) return

  // Rule 4 — paid for the required month
  const requiredMonth = new Date(lastBillingDate.getFullYear(), lastBillingDate.getMonth(), 1)
    .toISOString().slice(0, 10)  // "YYYY-MM-01"

  const { rows: [payment] } = await db.query(
    'SELECT id FROM store_payments WHERE store_id = $1 AND reference_month = $2',
    [storeId, requiredMonth]
  )

  if (!payment) {
    throw new Error('Pagamento em atraso. Entre em contato com o suporte para regularizar o acesso.')
  }
}

/** Returns a human-readable billing status for a store. */
export function billingStatus(store: {
  trial_ends_at: Date | null
  billing_day:   number | null
}, paidMonths: string[]): {
  status: 'trial' | 'ok' | 'grace' | 'blocked'
  trialEndsAt:    string | null
  billingDay:     number
  lastBillingDate: string | null
  gracePeriodEnd:  string | null
  requiredMonth:   string | null
  paid:            boolean
} {
  const trialEndsAt = store.trial_ends_at ? new Date(store.trial_ends_at) : null
  const billingDay  = store.billing_day ?? 1
  const today       = new Date()
  today.setHours(0, 0, 0, 0)

  if (trialEndsAt && today <= trialEndsAt) {
    return { status: 'trial', trialEndsAt: trialEndsAt.toISOString().slice(0, 10),
      billingDay, lastBillingDate: null, gracePeriodEnd: null, requiredMonth: null, paid: true }
  }

  if (!trialEndsAt) {
    return { status: 'ok', trialEndsAt: null,
      billingDay, lastBillingDate: null, gracePeriodEnd: null, requiredMonth: null, paid: true }
  }

  const todayDay = today.getDate()
  const lastBillingDate = todayDay >= billingDay
    ? new Date(today.getFullYear(), today.getMonth(), billingDay)
    : new Date(today.getFullYear(), today.getMonth() - 1, billingDay)

  if (lastBillingDate <= trialEndsAt) {
    return { status: 'ok', trialEndsAt: trialEndsAt.toISOString().slice(0, 10),
      billingDay, lastBillingDate: lastBillingDate.toISOString().slice(0, 10),
      gracePeriodEnd: null, requiredMonth: null, paid: true }
  }

  const gracePeriodEnd = new Date(lastBillingDate)
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7)

  const requiredMonth = new Date(lastBillingDate.getFullYear(), lastBillingDate.getMonth(), 1)
    .toISOString().slice(0, 10)

  const paid = paidMonths.includes(requiredMonth)

  const inGrace = today <= gracePeriodEnd

  return {
    status:          paid ? 'ok' : inGrace ? 'grace' : 'blocked',
    trialEndsAt:     trialEndsAt.toISOString().slice(0, 10),
    billingDay,
    lastBillingDate: lastBillingDate.toISOString().slice(0, 10),
    gracePeriodEnd:  gracePeriodEnd.toISOString().slice(0, 10),
    requiredMonth,
    paid,
  }
}
