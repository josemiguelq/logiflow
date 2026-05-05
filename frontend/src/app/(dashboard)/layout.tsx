'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Menu, Truck } from 'lucide-react'
import { Sidebar } from '@/components/layout/sidebar'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/hooks/useTheme'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router           = useRouter()
  const pathname         = usePathname()
  const { user, init }   = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: 'var(--color-primary)' }}
          >
            <Truck className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="font-bold text-gray-900">LogiFlow</span>
        </div>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
