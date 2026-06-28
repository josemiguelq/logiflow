'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Truck, ArrowLeft, Search, MapPin, Loader2, Check } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { StoreUser } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { maskDocument, stripDocument, isValidDocument } from '@/lib/document'
import { GoogleLogin } from '@react-oauth/google'

const GOOGLE_ENABLED = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

const MapPicker = dynamic(() => import('./_map_picker'), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-gray-400">Carregando mapa…</div>,
})

const STEPS = ['Loja', 'Endereço', 'Plano', 'Acesso']

interface Plan {
  id:                string
  name:              string
  priceCents:        number
  maxDeliverers:     number | null
  maxOrdersPerMonth: number | null
  features:          string[]
}

const FEATURE_LABEL: Record<string, string> = {
  whatsapp:         'Notificações WhatsApp',
  custom_theme:     'Logo e cores',
  csv_export:       'Exportação CSV',
  customer_ratings: 'Avaliação de entregadores',
}

const fmtPrice = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function geocode(q: string): Promise<{ lat: number; lng: number } | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
    { headers: { 'Accept-Language': 'pt-BR' } }
  )
  const data = (await res.json()) as { lat: string; lon: string }[]
  if (data[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  return null
}

export default function CadastroPage() {
  const router         = useRouter()
  const { setSession } = useAuth()

  const [step, setStep]       = useState(0)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  // Etapa 1
  const [storeName, setStoreName] = useState('')
  const [doc, setDoc]             = useState('')
  const [email, setEmail]         = useState('')
  const [prospectId, setProspectId] = useState('')

  // Etapa 2
  const [address, setAddress] = useState('')
  const [lat, setLat]         = useState<number | null>(null)
  const [lng, setLng]         = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)

  // Etapa 3 — Plano
  const [plans, setPlans]   = useState<Plan[]>([])
  const [planId, setPlanId] = useState<string>('')

  // Etapa 4 — Acesso
  const [ownerName, setOwnerName] = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')

  useEffect(() => {
    api.get<Plan[]>('/plans').then(setPlans).catch(() => {})
  }, [])

  async function submitStep1() {
    if (storeName.trim().length < 2) return setError('Informe o nome da loja')
    if (!isValidDocument(doc)) return setError('CPF/CNPJ inválido')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setError('E-mail inválido')
    setLoading(true); setError('')
    try {
      const res = await api.post<{ id: string }>('/auth/prospect', {
        storeName: storeName.trim(), cpfCnpj: stripDocument(doc), email: email.trim(),
      })
      setProspectId(res.id)
      setStep(1)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  async function locate() {
    if (!address.trim()) return
    setGeocoding(true); setError('')
    try {
      const r = await geocode(address.trim())
      if (r) { setLat(r.lat); setLng(r.lng) }
      else setError('Endereço não encontrado — ajuste o pino no mapa.')
    } catch { setError('Não foi possível localizar — ajuste o pino no mapa.') }
    finally { setGeocoding(false) }
  }

  async function submitStep2() {
    if (lat == null || lng == null) return setError('Confirme a localização no mapa.')
    setLoading(true); setError('')
    try {
      await api.patch(`/auth/prospect/${prospectId}`, { address: address.trim() || undefined, lat, lng })
      setStep(2)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao salvar')
    } finally { setLoading(false) }
  }

  function submitStepPlan() {
    if (!planId) return setError('Escolha um plano para continuar')
    setError('')
    setStep(3)
  }

  async function submitStep3() {
    if (ownerName.trim().length < 2) return setError('Informe seu nome')
    if (password.length < 6) return setError('A senha deve ter ao menos 6 caracteres')
    if (password !== confirm) return setError('As senhas não coincidem')
    setLoading(true); setError('')
    try {
      const res = await api.post<{ token: string; user: StoreUser }>(
        `/auth/prospect/${prospectId}/convert`,
        { ownerName: ownerName.trim(), password, planId: planId || null }
      )
      setSession(res.token, res.user)
      router.push('/orders')
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao concluir')
    } finally { setLoading(false) }
  }

  // Conclui o cadastro com Google: o e-mail/nome da conta Google viram o acesso do owner.
  async function submitStep3Google(credential?: string) {
    if (!credential) return
    setLoading(true); setError('')
    try {
      const res = await api.post<{ token: string; user: StoreUser }>(
        `/auth/prospect/${prospectId}/convert`,
        { ownerName: ownerName.trim() || undefined, googleCredential: credential, planId: planId || null }
      )
      setSession(res.token, res.user)
      router.push('/orders')
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao concluir')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg" style={{ background: 'var(--color-primary)' }}>
            <Truck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">LogiFlow</h1>
          <p className="mt-1 text-sm text-gray-500">3 meses grátis — sem cartão de crédito</p>
        </div>

        {/* Stepper */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                i < step ? 'bg-green-500 text-white' : i === step ? 'text-white' : 'bg-gray-200 text-gray-500'
              }`} style={i === step ? { background: 'var(--color-primary)' } : undefined}>
                {i + 1}
              </div>
              <span className={`text-xs ${i === step ? 'font-semibold text-gray-800' : 'text-gray-400'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className="mx-1 h-px w-4 bg-gray-200" />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {step > 0 && (
            <button onClick={() => { setError(''); setStep(step - 1) }} className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
          )}

          {/* Etapa 1 — Loja */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Dados da loja</h2>
              <Field label="Nome da loja">
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Ex: Padaria do João" />
              </Field>
              <Field label="CPF ou CNPJ">
                <Input value={doc} onChange={(e) => setDoc(maskDocument(e.target.value))} inputMode="numeric" placeholder="000.000.000-00" />
              </Field>
              <Field label="E-mail">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="seu@email.com" />
              </Field>
            </div>
          )}

          {/* Etapa 2 — Endereço + mapa */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Endereço da loja</h2>
              <p className="text-sm text-gray-500">Busque o endereço e ajuste o pino no mapa para confirmar a localização exata.</p>
              <div className="flex gap-2">
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Rua, número, cidade"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); locate() } }} />
                <Button type="button" variant="outline" onClick={locate} disabled={geocoding}>
                  {geocoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              <div className="h-72 overflow-hidden rounded-xl border border-gray-200">
                <MapPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
              </div>
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin className="h-3.5 w-3.5" />
                {lat != null && lng != null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : 'Clique no mapa ou busque um endereço'}
              </p>
            </div>
          )}

          {/* Etapa 3 — Plano */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Escolha seu plano</h2>
              <p className="text-sm text-gray-500">3 meses grátis — você só começa a pagar após o período de teste.</p>
              <div className="space-y-2">
                {plans.length === 0 && (
                  <p className="text-sm text-gray-400">Carregando planos…</p>
                )}
                {plans.map((p) => {
                  const selected = planId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPlanId(p.id); setError('') }}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                          }`}>
                            {selected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <span className="font-semibold text-gray-900">{p.name}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {fmtPrice(p.priceCents)}<span className="text-xs font-normal text-gray-400">/mês</span>
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-6 text-xs text-gray-500">
                        <span>{p.maxDeliverers == null ? 'Entregadores ilimitados' : `Até ${p.maxDeliverers} entregadores`}</span>
                        <span>{p.maxOrdersPerMonth == null ? 'Entregas ilimitadas' : `Até ${p.maxOrdersPerMonth.toLocaleString('pt-BR')} entregas/mês`}</span>
                        {p.features.map((f) => (
                          <span key={f}>{FEATURE_LABEL[f] ?? f}</span>
                        ))}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Etapa 4 — Acesso */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Seu acesso</h2>
              <Field label="Seu nome">
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="João Silva" />
              </Field>
              <Field label="Senha">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mínimo 6 caracteres" />
              </Field>
              <Field label="Confirmar senha">
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Repita a senha" />
              </Field>

              {GOOGLE_ENABLED && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs text-gray-400">ou cadastre-se com</span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={(cred) => submitStep3Google(cred.credential)}
                      onError={() => setError('Erro ao cadastrar com Google')}
                      text="signup_with"
                      shape="rectangular"
                      width="320"
                    />
                  </div>
                  <p className="text-center text-xs text-gray-400">
                    Com o Google você não precisa definir senha.
                  </p>
                </>
              )}
            </div>
          )}

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <Button
            type="button"
            className="mt-6 w-full"
            disabled={loading}
            onClick={
              step === 0 ? submitStep1 :
              step === 1 ? submitStep2 :
              step === 2 ? submitStepPlan :
              submitStep3
            }
          >
            {loading ? 'Salvando…' : step === 3 ? 'Concluir cadastro' : 'Avançar'}
          </Button>

          {step === 0 && (
            <p className="mt-4 text-center text-sm text-gray-500">
              Já tem conta?{' '}
              <Link href="/login" className="font-medium hover:underline" style={{ color: 'var(--color-primary)' }}>Entrar</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}
