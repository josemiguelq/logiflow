'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Package, Users, Truck, MessageSquare, Settings, LogOut, X, Route, UserCog, BarChart2, Clock, Target,
} from 'lucide-react'
import useSWR from 'swr'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useAccess } from '@/hooks/useAccess'
import { api } from '@/lib/api'

interface ThemeData {
  theme:    { primary: string; secondary: string; accent: string; logoUrl?: string | null; storeName?: string | null }
  features: { customThemeEnabled: boolean }
}

interface BillingData {
  status:        'trial' | 'ok' | 'grace' | 'blocked'
  trialDaysLeft: number | null
  planLabel:     string
}

const BASE_NAV: {
  href:    string
  label:   string
  icon:    React.ElementType
  scope:   string | null
  feature: string | null   // canonical feature name, e.g. 'whatsapp'
}[] = [
  { href: '/orders',     label: 'Pedidos',      icon: Package,       scope: 'orders:view',     feature: null },
  { href: '/routes',     label: 'Rotas',         icon: Route,         scope: 'routes:view',     feature: null },
  { href: '/customers',  label: 'Clientes',      icon: Users,         scope: 'customers:view',  feature: null },
  { href: '/deliverers', label: 'Entregadores',  icon: Truck,         scope: 'deliverers:view', feature: null },
  { href: '/analytics',  label: 'Analítico',     icon: BarChart2,     scope: 'analytics:view',  feature: null },
  { href: '/goals',      label: 'Metas',          icon: Target,        scope: 'goals:view',      feature: null },
  { href: '/users',      label: 'Usuários',      icon: UserCog,       scope: 'users:view',      feature: null },
  { href: '/whatsapp',   label: 'WhatsApp',      icon: MessageSquare, scope: 'whatsapp:view',   feature: 'whatsapp' },
  { href: '/settings',   label: 'Configurações', icon: Settings,      scope: 'settings:view',   feature: null },
]

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function Sidebar({ isOpen, onClose }: Props) {
  const pathname      = usePathname()
  const { user, logout } = useAuth()
  const { can }       = useAccess()
  const { data: themeData }   = useSWR<ThemeData>('/store/theme', (u: string) => api.get<ThemeData>(u))
  const { data: billingData } = useSWR<BillingData>('/store/billing', (u: string) => api.get<BillingData>(u))
  const logoUrl          = themeData?.theme?.logoUrl ?? null
  const customTheme      = themeData?.features?.customThemeEnabled ?? false
  const storeName        = themeData?.theme?.storeName ?? null
  const brandName        = customTheme && storeName ? storeName : 'LogiFlow'

  const nav = BASE_NAV.filter(item =>
    can({
      scope:   item.scope   ?? undefined,
      feature: item.feature ?? undefined,
    })
  )

  return (
    <>
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
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
          <div className="flex items-center gap-2.5">
            {logoUrl ? (
              <img src={logoUrl} alt={brandName} className="h-8 w-auto max-w-[140px] object-contain" />
            ) : (
              <>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ background: 'var(--color-primary)' }}
                >
                  <Truck className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900">{brandName}</span>
              </>
            )}
          </div>
          <button
            className="rounded-md p-1 text-gray-400 hover:text-gray-700 md:hidden"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

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

        <div className="border-t border-gray-200 p-4">
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.email}</p>
            <p className="mt-0.5 text-xs font-medium" style={{ color: 'var(--color-primary)' }}>
              {user?.role}
            </p>
            {billingData?.status === 'trial' && billingData.trialDaysLeft !== null && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1.5">
                <Clock className="h-3 w-3 text-blue-500 shrink-0" />
                <span className="text-xs text-blue-700 font-medium">
                  {billingData.trialDaysLeft === 0
                    ? 'Último dia de trial'
                    : `${billingData.trialDaysLeft} dias de trial`}
                </span>
              </div>
            )}
            {billingData?.status === 'grace' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5">
                <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700 font-medium">Pagamento pendente</span>
              </div>
            )}
            {billingData?.status === 'blocked' && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1.5">
                <Clock className="h-3 w-3 text-red-500 shrink-0" />
                <span className="text-xs text-red-700 font-medium">Acesso bloqueado</span>
              </div>
            )}
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
