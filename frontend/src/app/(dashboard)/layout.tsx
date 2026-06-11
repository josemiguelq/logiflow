'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, Truck, CheckCircle2, X, MapPin, Clock } from 'lucide-react'
import useSWR from 'swr'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { WsProvider, useWs } from '@/hooks/WsContext'
import { formatDelayDuration } from '@/lib/utils'
import { api } from '@/lib/api'
import { OperatorAlerts } from '@/components/alerts/operator-alerts'

interface DeliveryNotif {
  id:            string
  type:          'DELIVERED' | 'OUT_FOR_DELIVERY' | 'DELAYED_YELLOW' | 'DELAYED_RED'
  customerName:  string
  shortId:       string
  delivererName?: string
  address?:      string
  minutes?:      number
}

interface ThemeData {
  theme:    { primary: string; secondary: string; accent: string; logoUrl?: string | null; storeName?: string | null }
  features: { customThemeEnabled: boolean }
}

// Inner component — can safely call useWs() because WsProvider is above it
function DashboardShell({ children }: { children: React.ReactNode }) {
  const router    = useRouter()
  const pathname  = usePathname()
  const { user, init } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifs, setNotifs]           = useState<DeliveryNotif[]>([])
  const { data: themeData } = useSWR<ThemeData>('/store/theme', (u: string) => api.get<ThemeData>(u))
  const { on } = useWs()

  // How long each notification stays on screen before auto-dismissing
  const NOTIF_TTL = 15_000
  // Per-notification timers so replacing one (e.g. OUT_FOR_DELIVERY → DELIVERED) resets its timer
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    setNotifs(prev => prev.filter(n => n.id !== id))
  }, [])

  // Clear any pending timers on unmount
  useEffect(() => {
    const map = timers.current
    return () => { map.forEach(clearTimeout); map.clear() }
  }, [])

  useEffect(() => {
    return on('order_updated', (data) => {
      const order = data as {
        id: string
        status: string
        customer?: { name: string; address?: string }
        deliverer?: { name: string }
      }
      if (order.status !== 'DELIVERED' && order.status !== 'OUT_FOR_DELIVERY') return
      const shortId = '#' + order.id.slice(-8).toUpperCase()
      const notif: DeliveryNotif = {
        id:            order.id,
        type:          order.status,
        customerName:  order.customer?.name ?? 'Cliente',
        shortId,
        delivererName: order.deliverer?.name,
        address:       order.customer?.address,
      }
      setNotifs(prev => [...prev.filter(n => n.id !== order.id), notif])
      // Reset the timer if this order already had a notification
      const existing = timers.current.get(order.id)
      if (existing) clearTimeout(existing)
      timers.current.set(order.id, setTimeout(() => dismiss(order.id), NOTIF_TTL))
    })
  }, [on, dismiss])

  // ── Bandeiras de atraso (pedido em rota parado há muito tempo) ──
  useEffect(() => {
    return on('order_delayed', (data) => {
      const d = data as {
        orderId: string
        level: 'yellow' | 'red'
        customerName?: string
        shortId?: string
        delivererName?: string
        minutes?: number
      }
      const id = `delay-${d.orderId}`
      const notif: DeliveryNotif = {
        id,
        type:          d.level === 'red' ? 'DELAYED_RED' : 'DELAYED_YELLOW',
        customerName:  d.customerName ?? 'Cliente',
        shortId:       d.shortId ?? '#' + d.orderId.slice(-8).toUpperCase(),
        delivererName: d.delivererName,
        minutes:       d.minutes,
      }
      setNotifs(prev => [...prev.filter(n => n.id !== id), notif])
      const existing = timers.current.get(id)
      if (existing) clearTimeout(existing)
      timers.current.set(id, setTimeout(() => dismiss(id), NOTIF_TTL))
    })
  }, [on, dismiss])

  const logoUrl     = themeData?.theme?.logoUrl ?? null
  const customTheme = themeData?.features?.customThemeEnabled ?? false
  const storeName   = themeData?.theme?.storeName ?? null
  const brandName   = customTheme && storeName ? storeName : 'LogiFlow'

  useTheme()

  useEffect(() => { init() }, [init])

  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? localStorage.getItem('logiflow_token')
      : null
    if (!token) router.push('/login')
  }, [router])

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  if (!user) return null

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={brandName} className="h-7 w-auto max-w-[120px] object-contain" />
          ) : (
            <>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: 'var(--color-primary)' }}
              >
                <Truck className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-gray-900">{brandName}</span>
            </>
          )}
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <OperatorAlerts />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>

      {/* Delivery notifications — stack upward, scroll if they exceed the viewport */}
      <div className="fixed bottom-6 right-6 z-50 flex max-h-[calc(100vh-3rem)] flex-col items-end gap-3 overflow-y-auto pr-0.5">
        {notifs.map(n => {
          const delivered = n.type === 'DELIVERED'
          const delayed   = n.type === 'DELAYED_YELLOW' || n.type === 'DELAYED_RED'
          const delayedRed = n.type === 'DELAYED_RED'
          const Icon  = delivered ? CheckCircle2 : delayed ? Clock : Truck
          const title = delivered
            ? 'Pedido entregue'
            : delayed
              ? (delayedRed ? 'Entrega muito atrasada 🚨' : 'Entrega atrasada ⏰')
              : 'Saiu para entrega'
          const iconWrap = delivered
            ? 'bg-green-500/15'
            : delayedRed
              ? 'bg-red-500/20'
              : delayed
                ? 'bg-yellow-500/15'
                : 'bg-orange-500/15'
          const iconColor = delivered
            ? 'text-green-400'
            : delayedRed
              ? 'text-red-400'
              : delayed
                ? 'text-yellow-400'
                : 'text-orange-400'
          return (
            <div
              key={n.id}
              className="flex w-[320px] items-start gap-3 rounded-xl bg-gray-900 pl-5 pr-4 py-4 text-white shadow-lg"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconWrap}`}
              >
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold leading-tight">{title}</p>
                {delayed && n.minutes != null && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    Em rota há {formatDelayDuration(n.minutes)}
                  </p>
                )}
                <p className="mt-0.5 truncate text-sm text-gray-300">
                  <span className="font-medium text-white">{n.customerName}</span>
                  <span className="ml-1 font-mono text-xs text-gray-400">{n.shortId}</span>
                </p>
                {n.delivererName && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                    <Truck className="h-3 w-3 shrink-0" />
                    <span className="truncate">{n.delivererName}</span>
                  </p>
                )}
                {n.address && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{n.address}</span>
                  </p>
                )}
              </div>
              <button
                onClick={() => dismiss(n.id)}
                aria-label="Fechar notificação"
                className="-mr-1 shrink-0 rounded-md p-1 text-gray-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WsProvider>
      <DashboardShell>{children}</DashboardShell>
    </WsProvider>
  )
}
