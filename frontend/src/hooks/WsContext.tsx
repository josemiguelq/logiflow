'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { useWebSocket } from './useWebSocket'

type WsCtx = Pick<ReturnType<typeof useWebSocket>, 'on' | 'onReconnect'>

const WsContext = createContext<WsCtx | null>(null)

export function WsProvider({ children }: { children: ReactNode }) {
  const { user }          = useAuth()
  const { on, onReconnect } = useWebSocket(user?.storeId)
  return <WsContext.Provider value={{ on, onReconnect }}>{children}</WsContext.Provider>
}

export function useWs(): WsCtx {
  const ctx = useContext(WsContext)
  if (!ctx) throw new Error('useWs must be used inside WsProvider')
  return ctx
}
