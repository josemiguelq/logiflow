'use client'

import { useEffect } from 'react'
import { api } from '@/lib/api'

const DEFAULT = {
  primary:   '#2563EB',
  secondary: '#F9FAFB',
  accent:    '#F97316',
}

const CACHE_KEY = 'logiflow_theme'
const CACHE_TTL = 60 * 60 * 1000 // 1h

interface ThemePayload {
  primary:   string
  secondary: string
  accent:    string
  logoUrl?:  string | null
}

function applyTheme(theme: ThemePayload) {
  const root = document.documentElement
  root.style.setProperty('--color-primary',   theme.primary)
  root.style.setProperty('--color-secondary', theme.secondary)
  root.style.setProperty('--color-accent',    theme.accent)
}

function readCache(): ThemePayload | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { theme, storeId, timestamp } = JSON.parse(raw)
    const currentStore = localStorage.getItem('logiflow_user')
      ? JSON.parse(localStorage.getItem('logiflow_user')!).storeId
      : null
    if (storeId !== currentStore) return null
    if (Date.now() - timestamp > CACHE_TTL) return null
    return theme
  } catch {
    return null
  }
}

function writeCache(storeId: string, theme: ThemePayload) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ storeId, theme, timestamp: Date.now() }))
  } catch {}
}

export function useTheme() {
  useEffect(() => {
    // Aplica do cache imediatamente (sem flash)
    const cached = readCache()
    if (cached) applyTheme(cached)

    // Valida com o backend em background
    api.get<{ theme: ThemePayload; features: { customThemeEnabled: boolean } }>('/store/theme')
      .then(({ theme }) => {
        applyTheme(theme)
        const user = localStorage.getItem('logiflow_user')
        if (user) {
          const { storeId } = JSON.parse(user)
          writeCache(storeId, theme)
        }
      })
      .catch(() => {
        // Sem tema configurado ou sem auth — mantém o padrão
        if (!cached) applyTheme(DEFAULT)
      })
  }, [])
}
