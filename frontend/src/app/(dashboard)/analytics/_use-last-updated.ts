'use client'

import { useCallback, useState } from 'react'

export function useLastUpdated() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const touch = useCallback(() => setLastUpdated(new Date()), [])
  return { lastUpdated, touch }
}
