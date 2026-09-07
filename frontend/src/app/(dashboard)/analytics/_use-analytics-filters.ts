'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange, Shortcut } from './_types'
import {
  todayRange, yesterdayRange, last7DaysRange, previous7DaysRange,
  thisMonthRange, lastMonthRange,
} from './_utils'

export interface AnalyticsFilters {
  shortcut:       Shortcut
  range:          DateRange
  compareEnabled: boolean
  compareRange:   DateRange | null
  isToday:        boolean
  setShortcut:          (s: Shortcut) => void
  setCustomRange:       (r: DateRange) => void
  setCompareEnabled:    (v: boolean) => void
  setCustomCompareRange: (r: DateRange) => void
}

function defaultCompareRange(shortcut: Shortcut): DateRange | null {
  switch (shortcut) {
    case 'today':     return yesterdayRange()
    case '7d':        return previous7DaysRange()
    case 'thisMonth': return lastMonthRange()
    default:          return null // 'yesterday' e 'custom' não têm comparação automática definida
  }
}

function rangeForShortcut(shortcut: Shortcut, customRange: DateRange): DateRange {
  switch (shortcut) {
    case 'today':     return todayRange()
    case 'yesterday': return yesterdayRange()
    case '7d':        return last7DaysRange()
    case 'thisMonth': return thisMonthRange()
    case 'custom':    return customRange
  }
}

export function useAnalyticsFilters(): AnalyticsFilters {
  const [shortcut, setShortcutState]   = useState<Shortcut>('thisMonth')
  const [customRange, setCustomRangeState] = useState<DateRange>(thisMonthRange)
  const [compareEnabled, setCompareEnabledState] = useState(true)
  const [customCompareRange, setCustomCompareRangeState] = useState<DateRange | null>(null)

  // Recalcula "hoje" periodicamente para o Modo Operação Diária não ficar
  // defasado em sessões longas (inclusive na virada da meia-noite).
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const range = useMemo(
    () => rangeForShortcut(shortcut, customRange),
    [shortcut, customRange, tick] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const setShortcut = useCallback((s: Shortcut) => {
    setShortcutState(s)
    setCompareEnabledState(s !== 'custom')
    setCustomCompareRangeState(null)
  }, [])

  const setCustomRange = useCallback((r: DateRange) => {
    setShortcutState('custom')
    setCustomRangeState(r)
  }, [])

  const setCompareEnabled = useCallback((v: boolean) => {
    setCompareEnabledState(v)
    if (!v) setCustomCompareRangeState(null)
  }, [])

  const compareRange = useMemo(() => {
    if (!compareEnabled) return null
    return customCompareRange ?? defaultCompareRange(shortcut)
  }, [compareEnabled, customCompareRange, shortcut])

  return {
    shortcut,
    range,
    compareEnabled,
    compareRange,
    isToday: shortcut === 'today',
    setShortcut,
    setCustomRange,
    setCompareEnabled,
    setCustomCompareRange: setCustomCompareRangeState,
  }
}
