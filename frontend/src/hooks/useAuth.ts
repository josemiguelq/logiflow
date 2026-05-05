'use client'

import { create } from 'zustand'
import { StoreUser } from '@/types'
import { authStorage } from '@/lib/auth'
import { api } from '@/lib/api'

interface AuthStore {
  user: StoreUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  init: () => void
}

export const useAuth = create<AuthStore>((set) => ({
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

  logout() {
    authStorage.clear()
    set({ token: null, user: null })
    window.location.href = '/login'
  },
}))
