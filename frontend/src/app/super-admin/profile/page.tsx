'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, KeyRound, Check } from 'lucide-react'

const SA_TOKEN_KEY = 'logiflow_sa_token'
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function saFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(SA_TOKEN_KEY)
  return fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).then(async r => {
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error ?? 'Erro') }
    if (r.status === 204) return null as T
    return r.json()
  })
}

interface Me {
  id:        string
  email:     string
  createdAt: string
}

export default function SuperAdminProfilePage() {
  const router = useRouter()

  const [me, setMe] = useState<Me | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword,     setNewPassword]     = useState('')
  const [confirm,         setConfirm]         = useState('')
  const [saving,          setSaving]          = useState(false)
  const [saved,           setSaved]           = useState(false)
  const [error,           setError]           = useState('')

  useEffect(() => {
    if (!localStorage.getItem(SA_TOKEN_KEY)) { router.replace('/super-admin'); return }
    saFetch<Me>('/super-admin/me')
      .then(setMe)
      .catch(() => router.replace('/super-admin'))
  }, [router])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    setSaving(true)
    try {
      await saFetch('/super-admin/me/password', {
        method: 'PATCH',
        body:   JSON.stringify({ currentPassword, newPassword }),
      })
      setSaved(true)
      setCurrentPassword(''); setNewPassword(''); setConfirm('')
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }, [currentPassword, newPassword, confirm])

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Perfil</h1>
        <p className="text-sm text-gray-500">Gerencie os dados da sua conta de super admin.</p>
      </div>

      {/* Account info */}
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Conta</h2>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
            <Mail className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{me.email}</p>
            <p className="text-xs text-gray-400">
              Conta criada em {new Date(me.createdAt).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>

      {/* Password change */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Alterar senha</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Senha atual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
          {saved && (
            <p className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              <Check className="h-4 w-4" /> Senha alterada com sucesso.
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
