'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'
import { themeStorageKey } from '@/lib/auth'

const CACHE_TTL = 60 * 60 * 1000 // 1h

interface ThemePayload {
  primary:   string
  secondary: string
  accent:    string
  logoUrl?:  string | null
  storeName?: string | null
}

interface CacheEntry {
  theme:     ThemePayload
  timestamp: number
}

function applyTheme(theme: ThemePayload) {
  const root = document.documentElement
  root.style.setProperty('--color-primary',   theme.primary)
  root.style.setProperty('--color-secondary', theme.secondary)
  root.style.setProperty('--color-accent',    theme.accent)
}

function currentStoreId(): string | null {
  try {
    const raw = localStorage.getItem('logiflow_user')
    if (!raw) return null
    return (JSON.parse(raw) as { storeId?: string }).storeId ?? null
  } catch { return null }
}

function readCache(): ThemePayload | null {
  try {
    const storeId = currentStoreId()
    if (!storeId) return null
    const raw = localStorage.getItem(themeStorageKey(storeId))
    if (!raw) return null
    const entry = JSON.parse(raw) as CacheEntry
    if (Date.now() - entry.timestamp > CACHE_TTL) return null
    return entry.theme
  } catch { return null }
}

function writeCache(storeId: string, theme: ThemePayload) {
  try {
    const entry: CacheEntry = { theme, timestamp: Date.now() }
    localStorage.setItem(themeStorageKey(storeId), JSON.stringify(entry))
  } catch { /* ignore quota errors */ }
}

export function useTheme() {
  useEffect(() => {
    const cached = readCache()
    if (cached) applyTheme(cached)

    api.get<{ theme: ThemePayload; features: { customThemeEnabled: boolean } }>('/store/theme')
      .then(({ theme }) => {
        applyTheme(theme)
        const storeId = currentStoreId()
        if (storeId) writeCache(storeId, theme)
      })
      .catch(() => {
        if (!cached) {
          document.documentElement.style.setProperty('--color-primary',   '#2563EB')
          document.documentElement.style.setProperty('--color-secondary', '#F9FAFB')
          document.documentElement.style.setProperty('--color-accent',    '#F97316')
        }
      })
  }, [])
}
