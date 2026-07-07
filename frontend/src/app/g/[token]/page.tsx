'use client'

import { use, useState, useEffect, useCallback } from 'react'
import { CheckCircle, Loader2, Truck } from 'lucide-react'
import { WarrantyPublic } from '@/types'
import { SignaturePad } from './_signature_pad'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

export default function PublicGarantiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [data,     setData]     = useState<WarrantyPublic | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [answers,  setAnswers]  = useState<Record<string, boolean>>({})
  const [signature, setSignature] = useState<string | null>(null)
  const [state,    setState]    = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/g/${token}`)
      if (!res.ok) {
        if (res.status === 404) { setData(null); return }
        throw new Error('Erro ao carregar')
      }
      const d: WarrantyPublic = await res.json()
      setData(d)
      if (d.status === 'confirmed') {
        setState('already')
        if (d.answers) {
          const map: Record<string, boolean> = {}
          for (const a of d.answers) map[a.questionId] = a.answer
          setAnswers(map)
        }
        if (d.signaturePath) setSignature(d.signaturePath)
        return
      }
      // Apply store theme
      if (d.storeTheme) {
        const r = document.documentElement
        r.style.setProperty('--color-primary',   d.storeTheme.primary)
        r.style.setProperty('--color-secondary', d.storeTheme.secondary)
        r.style.setProperty('--color-accent',    d.storeTheme.accent)
      }
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const allRequiredChecked = data?.questions.every(q => !q.required || answers[q.id]) ?? false
  const canSubmit = allRequiredChecked && !!signature && state === 'idle'

  async function handleConfirm() {
    if (!canSubmit) return
    setState('loading')
    setError('')
    try {
      const res = await fetch(`${BASE}/g/${token}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: data!.questions.map(q => ({
            questionId: q.id,
            label: q.label,
            answer: !!answers[q.id],
          })),
          signature,
        }),
      })
      if (res.status === 409) {
        setState('already')
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Erro ao confirmar')
        setState('idle')
        return
      }
      setState('done')
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setState('idle')
    }
  }

  function toggleQuestion(id: string) {
    setAnswers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-900 border-t-transparent" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Garantia não encontrada.</p>
      </div>
    )
  }

  const theme = data.storeTheme
  const brandName = theme?.storeName ?? 'LogiFlow'

  // Already confirmed screen
  if (state === 'already' || state === 'done') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white shadow-sm">
          <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
            {theme?.logoUrl ? (
              <img src={theme.logoUrl} alt={brandName} className="h-7 w-auto max-w-[120px] object-contain" />
            ) : (
              <>
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{ background: theme ? 'var(--color-primary)' : '#111827' }}
                >
                  <Truck className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold text-gray-900">{brandName}</span>
              </>
            )}
          </div>
        </div>
        <main className="mx-auto max-w-lg px-4 py-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Garantia Confirmada!</h1>
              <p className="mt-1 text-sm text-gray-500">
                Sua confirmação de garantia foi registrada com sucesso.
              </p>
            </div>
            {data.customerName && (
              <p className="text-sm text-gray-700 font-medium">{data.customerName}</p>
            )}
            {state === 'already' && (
              <p className="text-xs text-gray-400">
                Esta garantia já havia sido confirmada anteriormente.
              </p>
            )}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-4 py-3">
          {theme?.logoUrl ? (
            <img src={theme.logoUrl} alt={brandName} className="h-7 w-auto max-w-[120px] object-contain" />
          ) : (
            <>
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: theme ? 'var(--color-primary)' : '#111827' }}
              >
                <Truck className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-gray-900">{brandName}</span>
            </>
          )}
          <span className="ml-auto text-xs text-gray-400">Confirmação de Garantia</span>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-6 space-y-4">
        {/* Customer info */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
          <p className="mt-1 font-semibold text-gray-900">{data.customerName}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.parts.map((part, i) => (
              <span key={i} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                {part}
              </span>
            ))}
          </div>
        </div>

        {/* Video */}
        {data.videoUrl ? (
          <div className="rounded-2xl overflow-hidden shadow-sm">
            <video
              controls
              className="w-full"
              src={data.videoUrl}
            >
              Seu navegador não suporta vídeo.
            </video>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500 text-center">
              Assista ao vídeo explicativo sobre os cuidados com as peças antes de continuar.
            </p>
          </div>
        )}

        {/* Questions */}
        <div className="rounded-2xl bg-white p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-gray-900">Declarações</p>
          {data.questions.map(q => (
            <label
              key={q.id}
              className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                answers[q.id] ? 'border-green-400 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                answers[q.id] ? 'border-green-500 bg-green-500' : 'border-gray-300'
              }`}>
                {answers[q.id] && <CheckCircle className="h-4 w-4 text-white" />}
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-800">{q.label}</p>
                {q.required && (
                  <span className="text-xs text-gray-400">* Obrigatório</span>
                )}
              </div>
              <input
                type="checkbox"
                checked={!!answers[q.id]}
                onChange={() => toggleQuestion(q.id)}
                className="sr-only"
              />
            </label>
          ))}
        </div>

        {/* Signature */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <SignaturePad onChange={setSignature} />
        </div>

        {/* Error */}
        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}

        {/* CTA */}
        <button
          onClick={handleConfirm}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-bold text-white transition-colors disabled:opacity-40"
          style={{ background: 'var(--color-primary)' }}
        >
          {state === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Confirmando…
            </span>
          ) : (
            'Confirmar'
          )}
        </button>

        <p className="text-center text-xs text-gray-400 pb-4">
          Ao confirmar, você declara que leu e concorda com as declarações acima.
        </p>
      </main>
    </div>
  )
}
