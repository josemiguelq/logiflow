'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { Plus, Megaphone, Pencil, Trash2, Bold, Italic, Heading, List, Link2, Loader2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { renderMarkdown } from '@/lib/markdown'

interface Announcement {
  id: string
  title: string | null
  body: string
  emoji: string | null
  accentColor: string | null
  backgroundColor: string | null
  textColor: string | null
  active: boolean
  expiresAt: string | null
  createdByName: string | null
  createdAt: string
}

const DEFAULTS = { accent: '#2563EB', background: '#FFFFFF', text: '#111827' }

function isExpired(a: Announcement) {
  return a.expiresAt != null && new Date(a.expiresAt) <= new Date()
}

export default function AnnouncementsPage() {
  const { data: announcements = [], mutate } = useSWR<Announcement[]>('/announcements', (u: string) => api.get<Announcement[]>(u))
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Announcement | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function confirmDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await api.delete(`/announcements/${deleting.id}`)
      setDeleting(null)
      mutate()
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Comunicados que aparecem como popup no app dos entregadores
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          Novo comunicado
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-gray-200 bg-white py-16 text-gray-400 shadow-sm">
          <Megaphone className="mb-3 h-10 w-10" />
          <p className="font-medium">Nenhum comunicado criado</p>
          <p className="mt-1 text-sm">Crie um comunicado para seus entregadores</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {announcements.map((a) => {
            const expired = isExpired(a)
            return (
              <div key={a.id} className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    {a.emoji && <span className="text-lg">{a.emoji}</span>}
                    <span className="line-clamp-1">{a.title || '(sem título)'}</span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      expired ? 'bg-amber-50 text-amber-700'
                      : a.active ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {expired ? 'Expirado' : a.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <p className="mb-3 line-clamp-3 whitespace-pre-wrap text-sm text-gray-500">{a.body}</p>
                <div className="mt-auto flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {a.expiresAt ? `Expira ${new Date(a.expiresAt).toLocaleDateString('pt-BR')}` : 'Sem validade'}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(a)} title="Editar"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleting(a)} title="Excluir"
                      className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {(creating || editing) && (
        <AnnouncementFormModal
          announcement={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); mutate() }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Excluir comunicado</h2>
                <p className="mt-1 text-sm text-gray-500">
                  O comunicado <span className="font-medium">{deleting.title || '(sem título)'}</span> será excluído. Esta ação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleting(null)}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleteLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40">
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// datetime-local <-> ISO helpers
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}

function AnnouncementFormModal({ announcement, onClose, onSaved }: {
  announcement: Announcement | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!announcement
  const [title, setTitle]       = useState(announcement?.title ?? '')
  const [emoji, setEmoji]       = useState(announcement?.emoji ?? '📢')
  const [body, setBody]         = useState(announcement?.body ?? '')
  const [accent, setAccent]     = useState(announcement?.accentColor ?? DEFAULTS.accent)
  const [bg, setBg]             = useState(announcement?.backgroundColor ?? DEFAULTS.background)
  const [textColor, setText]    = useState(announcement?.textColor ?? DEFAULTS.text)
  const [active, setActive]     = useState(announcement?.active ?? true)
  const [expires, setExpires]   = useState(isoToLocalInput(announcement?.expiresAt ?? null))
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  function wrap(before: string, after = before, placeholder = 'texto') {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart, end = ta.selectionEnd
    const sel = body.slice(start, end) || placeholder
    const next = body.slice(0, start) + before + sel + after + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = start + before.length + sel.length
    })
  }

  function prefixLine(prefix: string) {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = body.lastIndexOf('\n', start - 1) + 1
    const next = body.slice(0, lineStart) + prefix + body.slice(lineStart)
    setBody(next)
    requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + prefix.length })
  }

  async function handleSave() {
    if (!body.trim()) { setError('Escreva a mensagem do comunicado'); return }
    setLoading(true); setError('')
    const payload = {
      title:           title.trim() || null,
      body:            body,
      emoji:           emoji.trim() || null,
      accentColor:     accent,
      backgroundColor: bg,
      textColor,
      active,
      expiresAt:       expires ? new Date(expires).toISOString() : null,
    }
    try {
      if (isEdit) await api.patch(`/announcements/${announcement!.id}`, payload)
      else await api.post('/announcements', payload)
      onSaved()
    } catch (err: unknown) {
      setError((err as Error).message || 'Erro ao salvar')
      setLoading(false)
    }
  }

  const toolBtn = 'rounded p-1.5 text-gray-600 hover:bg-gray-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{isEdit ? 'Editar comunicado' : 'Novo comunicado'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-2">
          {/* ── Form ── */}
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-20">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Emoji</label>
                <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="text-center" />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Título</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Promoção de hoje" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Mensagem</label>
              <div className="mb-1.5 flex gap-1 rounded-lg border border-gray-200 p-1">
                <button type="button" className={toolBtn} title="Negrito" onClick={() => wrap('**')}><Bold className="h-4 w-4" /></button>
                <button type="button" className={toolBtn} title="Itálico" onClick={() => wrap('*')}><Italic className="h-4 w-4" /></button>
                <button type="button" className={toolBtn} title="Título" onClick={() => prefixLine('## ')}><Heading className="h-4 w-4" /></button>
                <button type="button" className={toolBtn} title="Lista" onClick={() => prefixLine('- ')}><List className="h-4 w-4" /></button>
                <button type="button" className={toolBtn} title="Link" onClick={() => wrap('[', '](https://)', 'texto')}><Link2 className="h-4 w-4" /></button>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                placeholder="Escreva o comunicado… use a barra acima para formatar."
                className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-gray-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ColorField label="Destaque" value={accent} onChange={setAccent} />
              <ColorField label="Fundo" value={bg} onChange={setBg} />
              <ColorField label="Texto" value={textColor} onChange={setText} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
                Ativo
              </label>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500">Expira em (opcional)</label>
                <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </div>
            </div>
          </div>

          {/* ── Preview ── */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Pré-visualização</label>
            <div className="flex min-h-[260px] items-center justify-center rounded-xl bg-gray-100 p-4">
              <AnnouncementPreview emoji={emoji} title={title} body={body} accent={accent} bg={bg} textColor={textColor} />
            </div>
          </div>
        </div>

        {error && <p className="px-6 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Salvar' : 'Criar comunicado'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer rounded-lg border border-gray-300" />
    </div>
  )
}

function AnnouncementPreview({ emoji, title, body, accent, bg, textColor }: {
  emoji: string; title: string; body: string; accent: string; bg: string; textColor: string
}) {
  return (
    <div className="w-full max-w-xs overflow-hidden rounded-2xl shadow-lg" style={{ background: bg, color: textColor }}>
      <div className="h-1.5 w-full" style={{ background: accent }} />
      <div className="p-5" style={{ color: textColor }}>
        {emoji && <div className="mb-2 text-3xl">{emoji}</div>}
        {title && <h3 className="mb-2 text-lg font-bold">{title}</h3>}
        <div style={{ color: textColor }}>{renderMarkdown(body || '_Sua mensagem aparece aqui…_')}</div>
        <button
          className="mt-5 w-full rounded-lg py-2.5 text-sm font-semibold text-white"
          style={{ background: accent }}
        >
          Entendi
        </button>
      </div>
    </div>
  )
}
