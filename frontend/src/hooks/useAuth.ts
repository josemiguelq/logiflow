'use client'

import { create } from 'zustand'
import { StoreUser } from '@/types'
import { authStorage } from '@/lib/auth'
import { api } from '@/lib/api'

interface AuthStore {
  user:       StoreUser | null
  token:      string | null
  login:      (email: string, password: string) => Promise<void>
  logout:     () => void
  init:       () => void
  hasScope:   (scope: string) => boolean
  setSession: (token: string, user: StoreUser) => void
}

export const useAuth = create<AuthStore>((set, get) => ({
  user:  null,
  token: null,

  init() {
    const token = authStorage.getToken()
    const user  = authStorage.getUser()
    if (token && user) set({ token, user })
  },

  async login(email, password) {
    const res = await api.post<{ token: string; user: StoreUser }>(
      '/auth/store/login',
      { email, password }
    )
    authStorage.setSession(res.token, res.user)
    set({ token: res.token, user: res.user })
  },

  setSession(token, user) {
    authStorage.setSession(token, user)
    set({ token, user })
  },

  logout() {
    authStorage.clear()
    set({ token: null, user: null })
    window.location.href = '/login'
  },

  hasScope(scope: string): boolean {
    return get().user?.scopes?.includes(scope) ?? false
  },
}))
