'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package, Users, Truck, MessageSquare, Settings, LogOut, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const nav = [
  { href: '/orders',     label: 'Pedidos',       icon: Package },
  { href: '/customers',  label: 'Clientes',      icon: Users },
  { href: '/deliverers', label: 'Entregadores',  icon: Truck },
  { href: '/whatsapp',   label: 'WhatsApp',      icon: MessageSquare },
  { href: '/settings',   label: 'Configurações', icon: Settings },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  return (
    <>
      {/* Backdrop (mobile only) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-gray-200 bg-white transition-transform duration-200',
          'md:static md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'var(--color-primary)' }}
            >
              <Truck className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">LogiFlow</span>
          </div>
          {/* Close button (mobile only) */}
          <button
            className="rounded-md p-1 text-gray-400 hover:text-gray-700 md:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {nav.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                      active
                        ? 'text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    )}
                    style={active ? { background: 'var(--color-primary)' } : {}}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 p-4">
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
              {user?.role}
            </p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
