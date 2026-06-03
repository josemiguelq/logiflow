import { describe, it, expect } from 'vitest'

// ── Mirrors the WHERE clause logic in findPreparing ──────────────────────────
//
// Rule: an order is visible to a requesting deliverer when:
//   1. reserved_by IS NULL          — nobody has reserved it
//   2. reserved_by = requesterId    — the deliverer reserved it themselves
//   3. reserved_at < now - 2min     — the reservation has expired
//
// This logic prevents cards disappearing when the deliverer reserves their own
// order (scenario that triggered the race-condition bug).

interface OrderRow {
  id: string
  reservedBy:  string | null
  reservedAt:  Date   | null
}

function isVisibleTo(order: OrderRow, requesterId: string, now = new Date()): boolean {
  if (order.reservedBy === null) return true
  if (order.reservedBy === requesterId) return true
  const ageMs = now.getTime() - (order.reservedAt?.getTime() ?? 0)
  return ageMs > 2 * 60 * 1000
}

// ─────────────────────────────────────────────────────────────────────────────

describe('findPreparing visibility rules', () => {
  const DELIVERER_A = 'deliverer-a'
  const DELIVERER_B = 'deliverer-b'
  const now = new Date()
  const recent = new Date(now.getTime() - 30_000)       // 30 s ago
  const expired = new Date(now.getTime() - 3 * 60_000)  // 3 min ago

  it('shows unreserved orders to any deliverer', () => {
    const order: OrderRow = { id: '1', reservedBy: null, reservedAt: null }
    expect(isVisibleTo(order, DELIVERER_A, now)).toBe(true)
    expect(isVisibleTo(order, DELIVERER_B, now)).toBe(true)
  })

  it('shows own reservation to the reserving deliverer', () => {
    const order: OrderRow = { id: '2', reservedBy: DELIVERER_A, reservedAt: recent }
    expect(isVisibleTo(order, DELIVERER_A, now)).toBe(true)
  })

  it('hides another deliverer active reservation', () => {
    const order: OrderRow = { id: '3', reservedBy: DELIVERER_B, reservedAt: recent }
    expect(isVisibleTo(order, DELIVERER_A, now)).toBe(false)
  })

  it('shows an expired reservation to any deliverer', () => {
    const order: OrderRow = { id: '4', reservedBy: DELIVERER_B, reservedAt: expired }
    expect(isVisibleTo(order, DELIVERER_A, now)).toBe(true)
  })

  it('shows own expired reservation to the same deliverer', () => {
    const order: OrderRow = { id: '5', reservedBy: DELIVERER_A, reservedAt: expired }
    expect(isVisibleTo(order, DELIVERER_A, now)).toBe(true)
  })
})
