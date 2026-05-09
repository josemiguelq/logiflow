'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Store, BarChart2, ShieldCheck, LogOut, Truck } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'

const NAV = [
  { href: '/super-admin/stores',    label: 'Lojas',          icon: Store      },
  { href: '/super-admin/analytics', label: 'Analítico',      icon: BarChart2  },
  { href: '/super-admin/scopes',    label: 'Roles & Scopes', icon: ShieldCheck },
]

export function SuperAdminSidebar() {
  const pathname = usePathname()
  const router   = useRouter()

  function logout() {
    localStorage.removeItem(SA_TOKEN_KEY)
    router.replace('/super-admin')
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-200 px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-900">
          <Truck className="h-3.5 w-3.5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">LogiFlow</p>
          <p className="text-xs text-gray-400">Super Admin</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-gray-200 p-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
