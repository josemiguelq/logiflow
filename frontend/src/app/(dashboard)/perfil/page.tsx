'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { User, Monitor, ShieldCheck, Loader2, Lock, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useAccess } from '@/hooks/useAccess'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Session {
  id: string
  ip: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string
  revokedAt: string | null
  active: boolean
  current: boolean
}
interface MySessions { lastLoginAt: string | null; sessions: Session[] }
interface UserSessions {
  user: { id: string; name: string; email: string; role: string }
  lastLoginAt: string | null
  activeCount: number
  sessions: Session[]
}

const ROLE_BADGE: Record<string, string> = {
  OWNER:     'bg-purple-100 text-purple-700',
  MANAGER:   'bg-blue-100 text-blue-700',
  ASSISTANT: 'bg-gray-100 text-gray-600',
}

// Resumo legível do user-agent (navegador · sistema).
function deviceLabel(ua?: string | null): string {
  if (!ua) return 'Dispositivo desconhecido'
  const os = /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux' : 'Outro'
  const br = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : 'Navegador'
  return `${br} · ${os}`
}

function SectionCard({ icon: Icon, title, action, children }: {
  icon: React.ElementType; title: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <h2 className="font-semibold text-gray-900">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function SessionTable({ sessions, onRevoke, revoking }: {
  sessions: Session[]; onRevoke?: (id: string) => void; revoking: string | null
}) {
  if (sessions.length === 0) {
    return <p className="py-6 text-center text-sm text-gray-400">Nenhuma sessão recente.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2">Dispositivo</th>
            <th className="px-3 py-2">IP</th>
            <th className="px-3 py-2">Último acesso</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sessions.map(s => (
            <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
              <td className="px-3 py-2.5 text-gray-800">{deviceLabel(s.userAgent)}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{s.ip ?? '—'}</td>
              <td className="px-3 py-2.5 text-gray-600">{formatDate(s.lastSeenAt)}</td>
              <td className="px-3 py-2.5">
                {s.current ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Esta sessão</span>
                ) : s.active ? (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">Ativa</span>
                ) : s.revokedAt ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Encerrada</span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Inativa</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right">
                {onRevoke && s.active && !s.current && (
                  <button
                    onClick={() => onRevoke(s.id)}
                    disabled={revoking === s.id}
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {revoking === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Encerrar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
      <CheckCircle className="h-4 w-4 text-green-400" />
      {message}
    </div>
  )
}

export default function ProfilePage() {
  const { user } = useAuth()
  const { can } = useAccess()
  const canViewAll = can({ scope: 'sessions:view_all' })

  const [toast, setToast] = useState('')
  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const { data: mine, mutate: mutateMine } = useSWR<MySessions>(
    '/store/me/sessions', (u: string) => api.get<MySessions>(u)
  )
  const { data: all, mutate: mutateAll } = useSWR<UserSessions[]>(
    canViewAll ? '/store/sessions/all' : null, (u: string) => api.get<UserSessions[]>(u)
  )

  const [revoking, setRevoking] = useState<string | null>(null)
  async function revoke(id: string) {
    setRevoking(id)
    try {
      await api.post(`/store/sessions/${id}/revoke`, {})
      await Promise.all([mutateMine(), canViewAll ? mutateAll() : Promise.resolve()])
    } finally { setRevoking(null) }
  }

  if (!user) return null

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Meu Perfil</h1>
      <p className="mb-8 text-sm text-gray-500">Sua conta e os acessos (sessões) ativos.</p>

      <div className="space-y-6">
        {/* Conta */}
        <SectionCard icon={User} title="Conta">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Nome</p>
              <p className="text-gray-900">{user.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-gray-900">{user.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Perfil</p>
              <span className={`mt-0.5 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role] ?? ROLE_BADGE.ASSISTANT}`}>
                {user.role}
              </span>
            </div>
            <div className="sm:col-span-3">
              <p className="text-xs text-gray-500">Último login</p>
              <p className="text-gray-900">{mine?.lastLoginAt ? formatDate(mine.lastLoginAt) : '—'}</p>
            </div>
          </div>
        </SectionCard>

        {/* Alterar senha */}
        <PasswordSection onSaved={() => showToast('Senha alterada com sucesso')} />

        {/* Minhas sessões */}
        <SectionCard
          icon={Monitor}
          title="Minhas sessões ativas"
          action={
            <span className="text-sm text-gray-400">
              {(mine?.sessions.filter(s => s.active).length ?? 0)} ativa(s)
            </span>
          }
        >
          <SessionTable sessions={mine?.sessions ?? []} onRevoke={revoke} revoking={revoking} />
        </SectionCard>

        {/* Sessões de todos (com scope) */}
        {canViewAll && (
          <SectionCard icon={ShieldCheck} title="Sessões de todos os usuários">
            <div className="space-y-5">
              {(all ?? []).map(u => (
                <div key={u.user.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="font-medium text-gray-900">{u.user.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.user.role] ?? ROLE_BADGE.ASSISTANT}`}>
                      {u.user.role}
                    </span>
                    <span className="text-xs text-gray-400">· {u.activeCount} ativa(s)</span>
                    {u.lastLoginAt && (
                      <span className="text-xs text-gray-400">· último login {formatDate(u.lastLoginAt)}</span>
                    )}
                  </div>
                  <SessionTable sessions={u.sessions} onRevoke={revoke} revoking={revoking} />
                </div>
              ))}
              {all && all.length === 0 && (
                <p className="text-sm text-gray-400">Nenhum usuário.</p>
              )}
            </div>
          </SectionCard>
        )}
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}

function PasswordSection({ onSaved }: { onSaved: () => void }) {
  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    setLoading(true)
    setError('')
    try {
      await api.patch('/store/me/password', {
        currentPassword: current,
        newPassword:     next,
      })
      setCurrent(''); setNext(''); setConfirm('')
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionCard icon={Lock} title="Alterar senha">
      <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha atual</label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Nova senha</label>
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            placeholder="Mínimo 6 caracteres"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="Repita a nova senha"
          />
        </div>

        {error && <p className="sm:col-span-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="sm:col-span-3">
          <Button type="submit" disabled={loading} className="w-full sm:w-auto">
            <Lock className="h-4 w-4" />
            {loading ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}
