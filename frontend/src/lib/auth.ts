import { StoreUser } from '@/types'

const TOKEN_KEY = 'logiflow_token'
const USER_KEY  = 'logiflow_user'

export function themeStorageKey(storeId: string) {
  return `logiflow_theme_${storeId}`
}

export const authStorage = {
  setSession(token: string, user: StoreUser) {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
  },

  getUser(): StoreUser | null {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  },

  clear() {
    try {
      const raw = localStorage.getItem(USER_KEY)
      if (raw) {
        const { storeId } = JSON.parse(raw) as { storeId?: string }
        if (storeId) localStorage.removeItem(themeStorageKey(storeId))
      }
    } catch { /* ignore */ }
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}
