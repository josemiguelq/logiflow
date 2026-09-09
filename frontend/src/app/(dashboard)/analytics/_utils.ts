import type { DateRange, DelivererPerformance, DelivererSortKey } from './_types'

export function toDateStr(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y!, m! - 1, d!)
  date.setDate(date.getDate() + days)
  return toDateStr(date)
}

export function todayRange(): DateRange {
  const today = toDateStr(new Date())
  return { from: today, to: today }
}

export function yesterdayRange(): DateRange {
  const y = addDays(toDateStr(new Date()), -1)
  return { from: y, to: y }
}

export function last7DaysRange(): DateRange {
  const today = toDateStr(new Date())
  return { from: addDays(today, -6), to: today }
}

export function previous7DaysRange(): DateRange {
  const today = toDateStr(new Date())
  return { from: addDays(today, -13), to: addDays(today, -7) }
}

export function thisMonthRange(): DateRange {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toDateStr(from), to: toDateStr(to) }
}

export function lastMonthRange(): DateRange {
  const now  = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to   = new Date(now.getFullYear(), now.getMonth(), 0)
  return { from: toDateStr(from), to: toDateStr(to) }
}

export function fmtDay(iso: string) {
  // iso = 'YYYY-MM-DD' → 'DD/MM'
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function fmtMonth(iso: string) {
  // iso = 'YYYY-MM' → 'MMM/YY'
  const [y, m] = iso.split('-')
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${months[Number(m) - 1]}/${y!.slice(2)}`
}

export function fmtDateBR(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function fmtDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

// Variação percentual entre o valor atual e o de comparação. Sem base para
// calcular % quando o período comparado é zero (division by zero) — nesse
// caso o card mostra só a diferença absoluta.
export function pct(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / previous) * 100
}

export function successRate(row: DelivererPerformance): number {
  const total = row.delivered + row.cancelled
  return total === 0 ? 0 : (row.delivered / total) * 100
}

export function sortDeliverers(
  rows: DelivererPerformance[], key: DelivererSortKey, dir: 'asc' | 'desc'
): DelivererPerformance[] {
  const value = (r: DelivererPerformance) => key === 'successRate' ? successRate(r) : r[key]
  const sorted = [...rows].sort((a, b) => value(a) - value(b))
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function escapeCsv(val: string | number | null | undefined): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadCsv(content: string, filename: string) {
  const bom = '﻿'
  downloadBlob(new Blob([bom + content], { type: 'text/csv;charset=utf-8;' }), filename)
}
