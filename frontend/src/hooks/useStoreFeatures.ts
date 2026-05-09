'use client'

import useSWR from 'swr'
import { api } from '@/lib/api'

interface StoreFeatures {
  customThemeEnabled:     boolean
  whatsappEnabled:        boolean
  csvExportEnabled:       boolean
  customerRatingsEnabled: boolean
}

const DEFAULTS: StoreFeatures = {
  customThemeEnabled: false, whatsappEnabled: false,
  csvExportEnabled: false, customerRatingsEnabled: false,
}

export function useStoreFeatures(): StoreFeatures {
  const { data } = useSWR<StoreFeatures>(
    '/store/features',
    (url: string) => api.get<StoreFeatures>(url),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  return data ?? DEFAULTS
}
