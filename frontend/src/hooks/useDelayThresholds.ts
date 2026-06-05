'use client'

import useSWR from 'swr'
import { api } from '@/lib/api'
import { DelayThresholds, DEFAULT_DELAY_THRESHOLDS } from '@/lib/utils'

interface StoreSettingsResponse {
  delayPrepYellowMin:    number
  delayPrepRedMin:       number
  delayTransitYellowMin: number
  delayTransitRedMin:    number
}

/**
 * Limiares (em minutos) das bandeiras de atraso configurados pela loja.
 * Usa SWR com dedupe — vários cards compartilham a mesma requisição.
 */
export function useDelayThresholds(): DelayThresholds {
  const { data } = useSWR<StoreSettingsResponse>(
    '/store/settings',
    (url: string) => api.get<StoreSettingsResponse>(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  if (!data) return DEFAULT_DELAY_THRESHOLDS
  return {
    prepYellow:    data.delayPrepYellowMin    ?? DEFAULT_DELAY_THRESHOLDS.prepYellow,
    prepRed:       data.delayPrepRedMin       ?? DEFAULT_DELAY_THRESHOLDS.prepRed,
    transitYellow: data.delayTransitYellowMin ?? DEFAULT_DELAY_THRESHOLDS.transitYellow,
    transitRed:    data.delayTransitRedMin    ?? DEFAULT_DELAY_THRESHOLDS.transitRed,
  }
}
