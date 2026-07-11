import { ImageResponse } from 'next/og'

// Card de marca 1200×630 gerado por código (next/og). Usado como preview ao
// compartilhar o link (WhatsApp, Slack, X, LinkedIn, iMessage…).
export const alt = 'LogiFlow — Gestão de entregas e logística urbana'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
          padding: '72px 80px',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 72,
              height: 72,
              borderRadius: 18,
              background: '#ffffff',
              color: '#2563EB',
              fontSize: 44,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>LogiFlow</div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            <span>Gestão de entregas e</span>
            <span>logística urbana</span>
          </div>
          <div style={{ fontSize: 34, color: '#DBEAFE', fontWeight: 400, lineHeight: 1.3 }}>
            Pedidos, rotas, rastreamento GPS ao vivo e confirmação de entrega.
          </div>
        </div>

        {/* Selo */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 9999,
              padding: '16px 28px',
              fontSize: 30,
              fontWeight: 600,
            }}
          >
            <div style={{ width: 16, height: 16, borderRadius: 9999, background: '#4ADE80' }} />
            3 meses grátis — sem cartão de crédito
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
