import React from 'react'

// Renderizador de markdown enxuto (mesmo subconjunto suportado no app mobile:
// # / ## títulos, - listas, **negrito**, *itálico*, [texto](url) e parágrafos).
// Usado no preview e na listagem de avisos. Sem dependências externas.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  // Quebra em **negrito**, *itálico* e [texto](url), preservando a ordem.
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g)
  return tokens.filter(Boolean).map((tok, i) => {
    const key = `${keyPrefix}-${i}`
    if (tok.startsWith('**') && tok.endsWith('**')) {
      return <strong key={key}>{tok.slice(2, -2)}</strong>
    }
    if (tok.startsWith('*') && tok.endsWith('*')) {
      return <em key={key}>{tok.slice(1, -1)}</em>
    }
    const link = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
          {link[1]}
        </a>
      )
    }
    return <React.Fragment key={key}>{tok}</React.Fragment>
  })
}

export function renderMarkdown(md: string): React.ReactNode {
  const lines = (md ?? '').split('\n')
  const out: React.ReactNode[] = []
  let bullets: React.ReactNode[] = []

  const flushBullets = () => {
    if (bullets.length) {
      out.push(<ul key={`ul-${out.length}`} className="list-disc pl-5 space-y-0.5">{bullets}</ul>)
      bullets = []
    }
  }

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd()
    if (line.startsWith('- ')) {
      bullets.push(<li key={`li-${idx}`}>{renderInline(line.slice(2), `li-${idx}`)}</li>)
      return
    }
    flushBullets()
    if (line.trim() === '') {
      out.push(<div key={`sp-${idx}`} className="h-2" />)
    } else if (line.startsWith('## ')) {
      out.push(<h3 key={`h3-${idx}`} className="text-base font-bold">{renderInline(line.slice(3), `h3-${idx}`)}</h3>)
    } else if (line.startsWith('# ')) {
      out.push(<h2 key={`h2-${idx}`} className="text-lg font-bold">{renderInline(line.slice(2), `h2-${idx}`)}</h2>)
    } else {
      out.push(<p key={`p-${idx}`} className="text-sm leading-relaxed">{renderInline(line, `p-${idx}`)}</p>)
    }
  })
  flushBullets()
  return <div className="space-y-1">{out}</div>
}
