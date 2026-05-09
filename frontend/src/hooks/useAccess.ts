'use client'

import { useCallback } from 'react'
import useSWR from 'swr'
import { useAuth } from './useAuth'
import { api } from '@/lib/api'

interface StoreFeatures {
  whatsappEnabled:        boolean
  customThemeEnabled:     boolean
  csvExportEnabled:       boolean
  customerRatingsEnabled: boolean
}

// Maps canonical feature names (from DB) to their boolean flag
const FEATURE_FLAGS: Record<string, keyof StoreFeatures> = {
  whatsapp:         'whatsappEnabled',
  custom_theme:     'customThemeEnabled',
  csv_export:       'csvExportEnabled',
  customer_ratings: 'customerRatingsEnabled',
}

export interface AccessCheck {
  scope?:   string   // e.g. 'whatsapp:view', 'routes:force_finish'
  feature?: string   // e.g. 'whatsapp', 'csv_export'
}

/**
 * Central hook for scope + feature access checks.
 *
 * `can({ scope, feature })` — both fields are optional and independent:
 *   - omit scope   → only the feature flag is checked
 *   - omit feature → only the scope is checked
 *   - provide both → both must pass
 *
 * `isLoading` is true while the store-features API response hasn't arrived yet.
 * Pages that gate on a feature should return null while isLoading is true to
 * avoid flashing content or triggering premature redirects.
 *
 * Usage — page guard:
 *   const { can, isLoading } = useAccess()
 *   useEffect(() => {
 *     if (isLoading) return
 *     if (!can({ scope: 'analytics:view' })) router.replace('/orders')
 *   }, [isLoading, can, router])
 *   if (isLoading || !can({ scope: 'analytics:view' })) return null
 *
 * Usage — button / action:
 *   <button disabled={!can({ scope: 'orders:cancel' })}>Cancelar</button>
 *   <button disabled={!can({ scope: 'whatsapp:connect', feature: 'whatsapp' })}>Conectar</button>
 */
export function useAccess() {
  const { user, hasScope } = useAuth()

  // Same SWR key as useStoreFeatures → cache is shared, no duplicate request
  const { data: features } = useSWR<StoreFeatures>(
    '/store/features',
    (url: string) => api.get<StoreFeatures>(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  const can = useCallback(({ scope, feature }: AccessCheck): boolean => {
    if (!user) return false
    if (scope && !hasScope(scope)) return false
    if (feature !== undefined) {
      if (features === undefined) return false // still loading → deny by default
      const flag = FEATURE_FLAGS[feature]
      if (flag && !features[flag]) return false
    }
    return true
  }, [user, features, hasScope])

  return {
    can,
    // isLoading only matters for feature checks; scope checks are instant
    isLoading: features === undefined,
  }
}
