'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { Save, Lock, Palette, SlidersHorizontal, CheckCircle, Upload, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { useStoreFeatures } from '@/hooks/useStoreFeatures'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface StoreSettings {
  storeName:            string
  maxOrdersPerRoute:    number
  requireDeliveryPhoto: boolean
  requirePickupCode:    boolean
  requireDeliveryCode:  boolean
  allowCustomerRatings: boolean
}

interface ThemeData {
  theme:    { primary: string; secondary: string; accent: string; logoUrl?: string | null }
  features: { customThemeEnabled: boolean }
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm text-white shadow-lg">
      <CheckCircle className="h-4 w-4 text-green-400" />
      {message}
    </div>
  )
}

export default function SettingsPage() {
  const { user } = useAuth()
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER'

  const [toast, setToast] = useState('')

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Configurações</h1>
      <p className="mb-8 text-sm text-gray-500">Gerencie as preferências da sua loja e conta</p>

      <div className="space-y-6">
        {isManager && <OperationsSection onSaved={() => showToast('Configurações salvas')} />}
        <ThemeSection isManager={isManager} onSaved={() => showToast('Tema atualizado')} />
        <PasswordSection onSaved={() => showToast('Senha alterada com sucesso')} />
      </div>

      {toast && <Toast message={toast} />}
    </div>
  )
}

function SectionCard({ icon: Icon, title, children }: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--color-primary)' }}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function OperationsSection({ onSaved }: { onSaved: () => void }) {
  const { data, mutate } = useSWR<StoreSettings>(
    '/store/settings',
    (u: string) => api.get<StoreSettings>(u)
  )
  const features = useStoreFeatures()

  const [maxOrders,             setMaxOrders]             = useState(5)
  const [requirePhoto,          setRequirePhoto]          = useState(false)
  const [requirePickupCode,     setRequirePickupCode]     = useState(true)
  const [requireDeliveryCode,   setRequireDeliveryCode]   = useState(true)
  const [allowCustomerRatings,  setAllowCustomerRatings]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (data) {
      setMaxOrders(data.maxOrdersPerRoute)
      setRequirePhoto(data.requireDeliveryPhoto)
      setRequirePickupCode(data.requirePickupCode)
      setRequireDeliveryCode(data.requireDeliveryCode)
      setAllowCustomerRatings(data.allowCustomerRatings ?? false)
    }
  }, [data])

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      await api.patch('/store/settings', {
        maxOrdersPerRoute:    maxOrders,
        requireDeliveryPhoto: requirePhoto,
        requirePickupCode,
        requireDeliveryCode,
        ...(features.customerRatingsEnabled ? { allowCustomerRatings } : {}),
      })
      mutate()
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SectionCard icon={SlidersHorizontal} title="Operações">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Máximo de pedidos por rota
          </label>
          <p className="mb-2 text-xs text-gray-500">
            Limite de pedidos que um entregador pode carregar em uma rota
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={maxOrders}
              onChange={(e) => setMaxOrders(Number(e.target.value))}
              className="flex-1 accent-[--color-primary]"
            />
            <span className="w-8 text-center text-sm font-semibold text-gray-900">{maxOrders}</span>
          </div>
        </div>

        {(
          [
            { label: 'Exigir foto na entrega',   desc: 'O entregador deve fotografar a entrega no app',                value: requirePhoto,       set: setRequirePhoto },
            { label: 'Exigir código de coleta', desc: 'Entregador confirma retirada com o código da rota',            value: requirePickupCode,  set: setRequirePickupCode },
            { label: 'Exigir código de entrega', desc: 'Entregador confirma entrega com os 4 últimos dígitos do tel.', value: requireDeliveryCode, set: setRequireDeliveryCode },
            ...(features.customerRatingsEnabled
              ? [{ label: 'Avaliação do cliente', desc: 'Clientes podem avaliar a entrega com até 5 estrelas na página de rastreamento', value: allowCustomerRatings, set: setAllowCustomerRatings }]
              : []),
          ] as { label: string; desc: string; value: boolean; set: (v: boolean) => void }[]
        ).map(({ label, desc, value, set }) => (
          <div key={label} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-500">{desc}</p>
            </div>
            <button
              type="button"
              onClick={() => set(!value)}
              className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              style={{ background: value ? 'var(--color-primary)' : '#E5E7EB' }}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  value ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
          <Save className="h-4 w-4" />
          {loading ? 'Salvando...' : 'Salvar configurações'}
        </Button>
      </div>
    </SectionCard>
  )
}

function ThemeSection({ isManager, onSaved }: { isManager: boolean; onSaved: () => void }) {
  const { data } = useSWR<ThemeData>(
    '/store/theme',
    (u: string) => api.get<ThemeData>(u)
  )

  const [primary,   setPrimary]   = useState('#2563EB')
  const [secondary, setSecondary] = useState('#F9FAFB')
  const [accent,    setAccent]    = useState('#F97316')
  const [logoUrl,   setLogoUrl]   = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (data?.theme) {
      setPrimary(data.theme.primary)
      setSecondary(data.theme.secondary)
      setAccent(data.theme.accent)
      setLogoUrl(data.theme.logoUrl ?? null)
    }
  }, [data])

  if (!data?.features.customThemeEnabled) {
    return (
      <SectionCard icon={Palette} title="Aparência">
        <div className="flex flex-col items-center rounded-xl border border-dashed border-gray-200 py-8 text-center text-gray-400">
          <Palette className="mb-2 h-8 w-8" />
          <p className="text-sm font-medium">Personalização de tema não disponível</p>
          <p className="mt-1 text-xs">Este recurso está disponível nos planos pagos</p>
        </div>
      </SectionCard>
    )
  }

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 512 * 1024) {
      setError('A logo deve ter no máximo 512 KB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setLogoUrl(reader.result as string)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSave() {
    setLoading(true)
    setError('')
    try {
      await api.patch('/store/theme', { primary, secondary, accent, logoUrl })
      document.documentElement.style.setProperty('--color-primary',   primary)
      document.documentElement.style.setProperty('--color-secondary', secondary)
      document.documentElement.style.setProperty('--color-accent',    accent)
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const colors = [
    { label: 'Cor principal',    value: primary,   set: setPrimary },
    { label: 'Cor secundária',   value: secondary,  set: setSecondary },
    { label: 'Cor de destaque',  value: accent,     set: setAccent },
  ]

  return (
    <SectionCard icon={Palette} title="Aparência">
      <div className="space-y-4">
        {/* Logo upload */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">Logo da loja</label>
          <p className="mb-3 text-xs text-gray-500">
            Substitui o ícone LogiFlow no menu. Use PNG com fundo transparente (máx. 512 KB).
          </p>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-32 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
              ) : (
                <span className="text-xs text-gray-400">Sem logo</span>
              )}
            </div>
            {isManager && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  {logoUrl ? 'Trocar logo' : 'Enviar logo'}
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl(null)}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Remover logo
                  </button>
                )}
              </div>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept=".png,image/png"
            className="hidden"
            onChange={handleLogoFile}
          />
        </div>

        {/* Color pickers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {colors.map(({ label, value, set }) => (
            <div key={label}>
              <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
              <div className="flex items-center gap-2.5">
                <input
                  type="color"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  disabled={!isManager}
                  className="h-10 w-10 cursor-pointer rounded-lg border border-gray-200 p-0.5 disabled:cursor-not-allowed"
                />
                <Input
                  value={value}
                  onChange={(e) => {
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) set(e.target.value)
                  }}
                  disabled={!isManager}
                  className="font-mono text-sm uppercase"
                  maxLength={7}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div className="flex gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
          <span className="text-xs text-gray-500">Preview:</span>
          <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: primary }}>Principal</span>
          <span className="rounded border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700" style={{ background: secondary }}>Secundária</span>
          <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: accent }}>Destaque</span>
        </div>

        {!isManager && (
          <p className="text-xs text-gray-400">Apenas gerentes e proprietários podem alterar o tema.</p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {isManager && (
          <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
            <Save className="h-4 w-4" />
            {loading ? 'Salvando...' : 'Salvar tema'}
          </Button>
        )}
      </div>
    </SectionCard>
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
    <SectionCard icon={Lock} title="Minha conta">
      <form onSubmit={handleSubmit} className="space-y-4">
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

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full sm:w-auto">
          <Lock className="h-4 w-4" />
          {loading ? 'Alterando...' : 'Alterar senha'}
        </Button>
      </form>
    </SectionCard>
  )
}
