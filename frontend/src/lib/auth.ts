import { StoreUser } from '@/types'

const TOKEN_KEY = 'logiflow_token'
const USER_KEY  = 'logiflow_user'
// Guarda a sessão do OWNER enquanto ele estiver impersonando outro usuário, para
// poder voltar sem precisar logar de novo.
const IMPERSONATOR_TOKEN_KEY = 'logiflow_impersonator_token'
const IMPERSONATOR_USER_KEY  = 'logiflow_impersonator_user'

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
    localStorage.removeItem(IMPERSONATOR_TOKEN_KEY)
    localStorage.removeItem(IMPERSONATOR_USER_KEY)
  },

  // Guarda a sessão atual (do OWNER) e troca para a sessão impersonada.
  startImpersonation(token: string, user: StoreUser) {
    const ownerToken = localStorage.getItem(TOKEN_KEY)
    const ownerUser  = localStorage.getItem(USER_KEY)
    if (ownerToken && ownerUser) {
      localStorage.setItem(IMPERSONATOR_TOKEN_KEY, ownerToken)
      localStorage.setItem(IMPERSONATOR_USER_KEY, ownerUser)
    }
    authStorage.setSession(token, user)
  },

  // Restaura a sessão do OWNER guardada em startImpersonation, se houver.
  stopImpersonation(): { token: string; user: StoreUser } | null {
    const token = localStorage.getItem(IMPERSONATOR_TOKEN_KEY)
    const raw   = localStorage.getItem(IMPERSONATOR_USER_KEY)
    if (!token || !raw) return null
    localStorage.removeItem(IMPERSONATOR_TOKEN_KEY)
    localStorage.removeItem(IMPERSONATOR_USER_KEY)
    const user = JSON.parse(raw) as StoreUser
    authStorage.setSession(token, user)
    return { token, user }
  },

  isImpersonating(): boolean {
    return !!localStorage.getItem(IMPERSONATOR_TOKEN_KEY)
  },
}

// Clears the session and sends the user to the login page. Safe to call multiple
// times — no-op when already on /login or running on the server.
export function forceLogout() {
  if (typeof window === 'undefined') return
  authStorage.clear()
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}
