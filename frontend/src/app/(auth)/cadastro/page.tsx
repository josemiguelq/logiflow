'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { StoreUser } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function CadastroPage() {
  const router        = useRouter()
  const { setSession } = useAuth()
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const fd       = new FormData(e.currentTarget)
    const password = fd.get('password') as string
    const confirm  = fd.get('confirm') as string

    if (password !== confirm) {
      setError('As senhas não coincidem')
      return
    }

    setLoading(true)
    try {
      const res = await api.post<{ token: string; user: StoreUser }>(
        '/auth/register',
        {
          storeName: fd.get('storeName'),
          ownerName: fd.get('ownerName'),
          email:     fd.get('email'),
          password,
        }
      )
      setSession(res.token, res.user)
      router.push('/orders')
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg"
            style={{ background: 'var(--color-primary)' }}
          >
            <Truck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">LogiFlow</h1>
          <p className="mt-1 text-sm text-gray-500">3 meses grátis — sem cartão de crédito</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-gray-800">Criar sua conta</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="storeName" className="mb-1.5 block text-sm font-medium text-gray-700">
                Nome da loja
              </label>
              <Input
                id="storeName"
                name="storeName"
                type="text"
                required
                minLength={2}
                placeholder="Ex: Padaria do João"
              />
            </div>

            <div>
              <label htmlFor="ownerName" className="mb-1.5 block text-sm font-medium text-gray-700">
                Seu nome
              </label>
              <Input
                id="ownerName"
                name="ownerName"
                type="text"
                required
                minLength={2}
                placeholder="João Silva"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                E-mail
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                Senha
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">
                Confirmar senha
              </label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={6}
                placeholder="Repita a senha"
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <Button type="submit" className="mt-6 w-full" disabled={loading}>
            {loading ? 'Criando conta...' : 'Começar grátis'}
          </Button>

          <p className="mt-4 text-center text-sm text-gray-500">
            Já tem conta?{' '}
            <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>
              Entrar
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}
