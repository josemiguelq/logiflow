'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, Truck, CheckCircle2, X, MapPin } from 'lucide-react'
import useSWR from 'swr'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { WsProvider, useWs } from '@/hooks/WsContext'
import { api } from '@/lib/api'

interface DeliveryNotif {
  id:            string
  type:          'DELIVERED' | 'OUT_FOR_DELIVERY'
  customerName:  string
  shortId:       string
  delivererName?: string
  address?:      string
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

  const dismiss = useCallback((id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id))
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
      setTimeout(() => dismiss(notif.id), 5000)
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

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>

      {/* Delivery notifications */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end">
        {notifs.map(n => {
          const delivered = n.type === 'DELIVERED'
          const Icon  = delivered ? CheckCircle2 : Truck
          const title = delivered ? 'Pedido entregue' : 'Saiu para entrega'
          return (
            <div
              key={n.id}
              className="flex w-[320px] items-start gap-3 rounded-xl bg-gray-900 pl-5 pr-4 py-4 text-white shadow-lg"
            >
              <span
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  delivered ? 'bg-green-500/15' : 'bg-orange-500/15'
                }`}
              >
                <Icon className={`h-5 w-5 ${delivered ? 'text-green-400' : 'text-orange-400'}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold leading-tight">{title}</p>
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
                className="-mr-1 rounded p-0.5 text-gray-400 hover:text-white"
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
