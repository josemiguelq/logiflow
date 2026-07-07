'use client'

import { use, useState, useEffect, useCallback, useRef } from 'react'

interface YTPlayer { playVideo(): void; destroy(): void }
interface YTEvent { data: number }
interface YTPlayerOpts { videoId: string; playerVars?: Record<string, string | number>; events: { onReady?: () => void; onStateChange?: (e: YTEvent) => void } }
interface YTAPI { Player: { new(el: HTMLElement | string, opts: YTPlayerOpts): YTPlayer }; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number } }
declare global { interface Window { YT: YTAPI | undefined } }
import { CheckCircle, Loader2, Truck, Play, Download, Lock } from 'lucide-react'
import { WarrantyPublic } from '@/types'
import { SignaturePad } from './_signature_pad'
import { toPng } from 'html-to-image'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  return m ? m[1] : null
}

function embedVideoUrl(url: string | null): { type: 'youtube' | 'direct'; src: string } | null {
  if (!url) return null
  const id = getYouTubeId(url)
  if (id) return { type: 'youtube', src: id }
  return { type: 'direct', src: url }
}

export default function PublicGarantiaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [data,     setData]     = useState<WarrantyPublic | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [answers,  setAnswers]  = useState<Record<string, boolean>>({})
  const [signature, setSignature] = useState<string | null>(null)
  const [state,    setState]    = useState<'idle' | 'loading' | 'done' | 'already'>('idle')
  const [error,    setError]    = useState('')
  const [videoEnded, setVideoEnded]   = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null)
  // Gate por telefone: senha = 4 últimos dígitos, enviada no header X-Tracking-Code.
  const [needsCode,  setNeedsCode]  = useState(false)
  const [phoneHint,  setPhoneHint]  = useState('')
  const [codeInput,  setCodeInput]  = useState('')
  const [codeError,  setCodeError]  = useState<string | null>(null)
  const [verifying,  setVerifying]  = useState(false)
  const codeRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const receiptRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const headers: Record<string, string> = {}
      if (codeRef.current) headers['X-Tracking-Code'] = codeRef.current
      const res = await fetch(`${BASE}/g/${token}`, { headers })
      if (res.status === 401) {
        // Senha exigida (ou incorreta, se já havíamos enviado uma).
        const d = await res.json().catch(() => ({})) as { phoneHint?: string }
        if (codeRef.current) { setCodeError('Senha incorreta. Tente novamente.'); codeRef.current = null }
        setPhoneHint(d.phoneHint ?? '')
        setNeedsCode(true)
        setData(null)
        return
      }
      if (!res.ok) {
        if (res.status === 404) { setData(null); return }
        throw new Error('Erro ao carregar')
      }
      setNeedsCode(false)
      setCodeError(null)
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

  // YouTube IFrame API setup
  useEffect(() => {
    const video = embedVideoUrl(data?.videoUrl ?? null)
    if (video?.type !== 'youtube' || state === 'already' || state === 'done') return

    const id = video.src

    function initPlayer() {
      const yt = window.YT
      if (!yt?.Player) { setTimeout(initPlayer, 200); return }
      playerRef.current?.destroy()
      const el = document.getElementById('youtube-player')
      if (!el) return
      playerRef.current = new yt.Player(el, {
        videoId: id,
        playerVars: { controls: 0, modestbranding: 1, rel: 0, autoplay: 1, playsinline: 1 },
        events: {
          onReady: () => { setVideoPlaying(true) },
          onStateChange: (e) => {
            if (e.data === yt.PlayerState.ENDED) { setVideoEnded(true); setVideoPlaying(false) }
            if (e.data === yt.PlayerState.PLAYING) setVideoPlaying(true)
            if (e.data === yt.PlayerState.PAUSED && !videoEnded) {
              setTimeout(() => { playerRef.current?.playVideo() }, 100)
            }
          },
        },
      })
    }

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    }

    initPlayer()

    return () => { playerRef.current?.destroy() }
  }, [data?.videoUrl, state, videoEnded])

  const allRequiredChecked = data?.questions.every(q => !q.required || answers[q.id]) ?? false
  const canSubmit = allRequiredChecked && !!signature && state === 'idle' && videoEnded

  async function handleConfirm() {
    if (!canSubmit) return
    setState('loading')
    setError('')
    try {
      const res = await fetch(`${BASE}/g/${token}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(codeRef.current ? { 'X-Tracking-Code': codeRef.current } : {}),
        },
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
      const body = await res.json() as { confirmedAt: string }
      setConfirmedAt(body.confirmedAt)
      setState('done')
    } catch {
      setError('Erro de conexão. Tente novamente.')
      setState('idle')
    }
  }

  function toggleQuestion(id: string) {
    setAnswers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    if (codeInput.length !== 4) { setCodeError('Informe os 4 dígitos.'); return }
    setVerifying(true)
    setCodeError(null)
    codeRef.current = codeInput
    await load()
    setVerifying(false)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-900 border-t-transparent" />
      </div>
    )
  }

  if (needsCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <form
          onSubmit={submitCode}
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex flex-col items-center text-center">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
              <Lock className="h-7 w-7 text-gray-500" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">Confirmação protegida</h1>
            <p className="mt-1 text-sm text-gray-500">
              Para acessar sua garantia, informe os <strong>últimos 4 dígitos do seu telefone</strong>.
            </p>
            {phoneHint && (
              <p className="mt-3 text-sm text-gray-600">
                Telefone cadastrado:{' '}
                <span className="font-semibold tracking-wide text-gray-900">{phoneHint}</span>
              </p>
            )}
          </div>

          <input
            inputMode="numeric"
            autoFocus
            maxLength={4}
            value={codeInput}
            onChange={(e) => { setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4)); setCodeError(null) }}
            placeholder="0000"
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 focus:border-gray-900 focus:outline-none"
          />

          {codeError && (
            <p className="mt-2 text-center text-sm text-red-600">{codeError}</p>
          )}

          <button
            type="submit"
            disabled={verifying || codeInput.length !== 4}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 transition-colors"
            style={{ background: 'var(--color-primary, #111827)' }}
          >
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {verifying ? 'Verificando…' : 'Acessar garantia'}
          </button>
        </form>
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
        <main className="mx-auto max-w-lg px-4 py-12 space-y-6">
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
            {state === 'already' && (
              <p className="text-xs text-gray-400">
                Esta garantia já havia sido confirmada anteriormente.
              </p>
            )}
          </div>

          {state === 'done' && (
            <>
              {/* Receipt */}
              <div
                ref={receiptRef}
                className="rounded-2xl bg-white p-6 shadow-sm space-y-4 text-sm"
              >
                <div className="text-center border-b border-gray-200 pb-3">
                  <p className="font-bold text-gray-900 text-base">{brandName}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Comprovante de Confirmação de Garantia</p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cliente</span>
                    <span className="font-medium text-gray-900 text-right max-w-[60%]">{data.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Peças</span>
                    <span className="font-medium text-gray-900 text-right max-w-[60%]">{data.parts.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Data da Venda</span>
                    <span className="font-medium text-gray-900">{new Date(data.saleAt).toLocaleString('pt-BR')}</span>
                  </div>
                  {(() => {
                    const dt = confirmedAt ?? data.confirmedAt
                    if (!dt) return null
                    return (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Confirmado em</span>
                        <span className="font-medium text-gray-900">{new Date(dt).toLocaleString('pt-BR')}</span>
                      </div>
                    )
                  })()}
                </div>

                {data.questions.length > 0 && (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Declarações</p>
                    <div className="space-y-1.5">
                      {data.questions.map(q => (
                        <div key={q.id} className="flex items-start gap-2">
                          <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            answers[q.id] ? 'border-green-500 bg-green-50' : 'border-gray-300'
                          }`}>
                            {answers[q.id] && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                          </span>
                          <p className="text-xs text-gray-700">{q.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(signature ?? data.signaturePath) && (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Rubrica</p>
                    <img
                      src={signature ?? data.signaturePath!}
                      alt="Rubrica"
                      className="max-h-16 rounded border border-gray-200 bg-white p-1"
                    />
                  </div>
                )}

                <div className="text-center border-t border-gray-200 pt-3">
                  <p className="text-[10px] text-gray-400">Este comprovante é válido como confirmação de garantia.</p>
                </div>
              </div>

              {/* Download button */}
              <button
                onClick={async () => {
                  if (!receiptRef.current) return
                  try {
                    const dataUrl = await toPng(receiptRef.current, { quality: 1, pixelRatio: 2 })
                    const link = document.createElement('a')
                    link.download = `comprovante-garantia-${data.customerName?.replace(/\s+/g, '-').toLocaleLowerCase()}.png`
                    link.href = dataUrl
                    link.click()
                  } catch {
                    // silent
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white transition-colors"
                style={{ background: 'var(--color-primary)' }}
              >
                <Download className="h-4 w-4" />
                Baixar Comprovante
              </button>
            </>
          )}
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
        <div className="rounded-2xl bg-yellow-50 p-4 shadow-sm">
            <p className="text-sm text-yellow-800"> A garantia deve ser confirmada apenas depois de ter concordado com os termos e condições. </p>
        </div>

        {/* Video */}
        {(() => {
          const video = embedVideoUrl(data.videoUrl)
          if (!video) {
            return (
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm text-gray-500 text-center">
                  Assista ao vídeo explicativo sobre os cuidados com as peças antes de continuar.
                </p>
              </div>
            )
          }
          if (video.type === 'youtube') {
            return (
              <div className="relative rounded-2xl overflow-hidden shadow-sm" style={{ aspectRatio: '16/9' }}>
                <div id="youtube-player" className="w-full h-full" />
                {!videoPlaying && !videoEnded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg">
                      <Play className="h-6 w-6 text-gray-900 ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
            )
          }
          return (
            <div className="relative rounded-2xl overflow-hidden shadow-sm">
              <video
                ref={videoRef}
                className="w-full"
                src={video.src}
                autoPlay
                muted
                playsInline
                onEnded={() => setVideoEnded(true)}
                onPlaying={() => setVideoPlaying(true)}
              >
                Seu navegador não suporta vídeo.
              </video>
              {!videoPlaying && !videoEnded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <button
                    onClick={() => videoRef.current?.play()}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-lg"
                  >
                    <Play className="h-6 w-6 text-gray-900 ml-0.5" />
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* Video not yet watched indicator */}
        {!videoEnded && data.videoUrl && (
          <p className="text-center text-xs text-gray-400 -mt-2">
            {videoPlaying ? 'A assistir…' : 'Assista ao vídeo completo para continuar'}
          </p>
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
