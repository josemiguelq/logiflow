'use client'

import { useEffect, useRef, useCallback } from 'react'
import { forceLogout } from '@/lib/auth'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

type EventHandler = (data: unknown) => void

export function useWebSocket(storeId: string | undefined) {
  const ws                = useRef<WebSocket | null>(null)
  const handlers          = useRef<Map<string, EventHandler[]>>(new Map())
  const reconnectHandlers = useRef<Set<() => void>>(new Set())
  const reconnect         = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const hasConnected      = useRef(false)

  const connect = useCallback(() => {
    if (!storeId) return

    const token = typeof window !== 'undefined'
      ? localStorage.getItem('logiflow_token')
      : null

    if (!token) return

    ws.current = new WebSocket(`${WS_URL}/ws?token=${encodeURIComponent(token)}`)

    ws.current.onopen = () => {
      if (hasConnected.current) {
        reconnectHandlers.current.forEach((h) => h())
      }
      hasConnected.current = true
    }

    ws.current.onmessage = (evt) => {
      try {
        const { event, data } = JSON.parse(evt.data)
        handlers.current.get(event)?.forEach((h) => h(data))
      } catch {}
    }

    ws.current.onclose = (event) => {
      // 1008 = backend rejected the token (missing/invalid/expired) — log out instead of looping.
      if (event.code === 1008) {
        forceLogout()
        return
      }
      // Only retry while we still have a token; otherwise stop the reconnect loop.
      const stillAuthed = typeof window !== 'undefined' && !!localStorage.getItem('logiflow_token')
      if (stillAuthed) {
        reconnect.current = setTimeout(connect, 3_000)
      }
    }
  }, [storeId])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnect.current)
      ws.current?.close()
    }
  }, [connect])

  const on = useCallback((event: string, handler: EventHandler) => {
    if (!handlers.current.has(event)) handlers.current.set(event, [])
    handlers.current.get(event)!.push(handler)
    return () => {
      const list = handlers.current.get(event) ?? []
      handlers.current.set(event, list.filter((h) => h !== handler))
    }
  }, [])

  const onReconnect = useCallback((handler: () => void) => {
    reconnectHandlers.current.add(handler)
    return () => { reconnectHandlers.current.delete(handler) }
  }, [])

  return { on, onReconnect }
}
