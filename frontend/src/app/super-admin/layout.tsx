'use client'

import { usePathname } from 'next/navigation'
import { SuperAdminSidebar } from './_sidebar'

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin  = pathname === '/super-admin'

  if (isLogin) return <>{children}</>

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <SuperAdminSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
