'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, Truck, CheckCircle2, X } from 'lucide-react'
import useSWR from 'swr'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'
import { useWebSocket } from '@/hooks/useWebSocket'
import { api } from '@/lib/api'

interface DeliveryNotif {
  id:           string
  customerName: string
}

interface ThemeData {
  theme:    { primary: string; secondary: string; accent: string; logoUrl?: string | null; storeName?: string | null }
  features: { customThemeEnabled: boolean }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router           = useRouter()
  const pathname         = usePathname()
  const { user, init }   = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifs, setNotifs]           = useState<DeliveryNotif[]>([])
  const { data: themeData } = useSWR<ThemeData>('/store/theme', (u: string) => api.get<ThemeData>(u))
  const { on } = useWebSocket(user?.storeId)

  const dismiss = useCallback((id: string) => {
    setNotifs(prev => prev.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    return on('order_updated', (data) => {
      const order = data as { id: string; status: string; customer?: { name: string } }
      if (order.status !== 'DELIVERED') return
      const notif: DeliveryNotif = { id: order.id, customerName: order.customer?.name ?? 'Cliente' }
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

  // Close sidebar on navigation
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
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
        {notifs.map(n => (
          <div
            key={n.id}
            className="flex items-center gap-3 rounded-xl bg-gray-900 pl-4 pr-3 py-3 text-sm text-white shadow-lg"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
            <span>
              <span className="font-semibold">{n.customerName}</span>
              <span className="text-gray-300"> — pedido entregue</span>
            </span>
            <button
              onClick={() => dismiss(n.id)}
              className="ml-1 rounded p-0.5 text-gray-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
