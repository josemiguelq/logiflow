'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Plus, Trash2, X, Users, KeyRound } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useAccess } from '@/hooks/useAccess'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StoreUserRow {
  id: string
  name: string
  email: string
  username: string
  role: 'OWNER' | 'MANAGER' | 'ASSISTANT'
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = {
  OWNER:     'Owner',
  MANAGER:   'Gerente',
  ASSISTANT: 'Assistente',
}

const ROLE_COLOR: Record<string, string> = {
  OWNER:     'bg-purple-100 text-purple-700',
  MANAGER:   'bg-blue-100 text-blue-700',
  ASSISTANT: 'bg-gray-100 text-gray-600',
}

export default function UsersPage() {
  const { user }    = useAuth()
  const { can }     = useAccess()
  const [showForm,  setShowForm]    = useState(false)
  const [resetting, setResetting]   = useState<StoreUserRow | null>(null)
  const { data: users = [], mutate } = useSWR<StoreUserRow[]>(
    '/store/users', (url: string) => api.get<StoreUserRow[]>(url)
  )

  const canManage       = user?.role === 'OWNER' || user?.role === 'MANAGER'
  const canResetPassword = can({ scope: 'users:reset_password' })
  const showActions     = canManage || canResetPassword

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remover ${name}?`)) return
    await api.delete(`/store/users/${id}`)
    mutate()
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500">{users.length} usuário(s) nesta loja</p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)} data-testid="users-new">
            <Plus className="h-4 w-4" /> Novo Usuário
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        {users.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-gray-400">
            <Users className="mb-2 h-8 w-8" />
            <p className="font-medium">Nenhum usuário encontrado</p>
          </div>
        ) : (
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email / Username</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Perfil</th>
                {showActions && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <p>{u.email}</p>
                    <p className="text-xs text-gray-400">@{u.username}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_COLOR[u.role]}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Reset de senha: não para si mesmo; MANAGER só em ASSISTANT */}
                        {canResetPassword && u.id !== user?.id && (user?.role === 'OWNER' || u.role === 'ASSISTANT') && (
                          <button
                            onClick={() => setResetting(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            <KeyRound className="h-3 w-3" /> Resetar senha
                          </button>
                        )}
                        {canManage && u.id !== user?.id && u.role !== 'OWNER' && (
                          <button
                            onClick={() => handleDelete(u.id, u.name)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-3 w-3" /> Remover
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <CreateUserModal
          currentRole={user?.role ?? 'ASSISTANT'}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); mutate() }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          target={resetting}
          onClose={() => setResetting(null)}
          onDone={() => setResetting(null)}
        />
      )}
    </div>
  )
}

function ResetPasswordModal({
  target, onClose, onDone,
}: {
  target: StoreUserRow
  onClose: () => void
  onDone: () => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    setLoading(true); setError('')
    try {
      await api.patch(`/store/users/${target.id}/password`, { newPassword })
      alert(`Senha de ${target.name} redefinida. As sessões ativas foram encerradas.`)
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Resetar senha</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Defina uma nova senha para <span className="font-medium text-gray-900">{target.name}</span> e
          repasse a ele. As sessões ativas serão encerradas.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nova senha</label>
            <Input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Salvando...' : 'Redefinir senha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function CreateUserModal({
  currentRole, onClose, onSaved,
}: {
  currentRole: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<'MANAGER' | 'ASSISTANT'>('ASSISTANT')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await api.post('/store/users', { name, email, username, password, role })
      onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Novo Usuário</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
            <Input value={name} onChange={e => setName(e.target.value)} required data-testid="user-name" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required data-testid="user-email" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required placeholder="apenas letras, números, _ e ." data-testid="user-username" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="user-password" />
          </div>
          {currentRole === 'OWNER' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Perfil</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as 'MANAGER' | 'ASSISTANT')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2"
                data-testid="user-role"
              >
                <option value="MANAGER">Gerente</option>
                <option value="ASSISTANT">Assistente</option>
              </select>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={loading} data-testid="user-submit">
              {loading ? 'Salvando...' : 'Criar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
