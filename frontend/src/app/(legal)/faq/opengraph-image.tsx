import { ImageResponse } from 'next/og'

export const alt = 'LogiFlow — Perguntas Frequentes sobre segurança e dados'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const questions = [
  'Como o LogiFlow protege meus dados?',
  'Onde meus dados são armazenados?',
  'Posso solicitar a exclusão dos meus dados?',
  'O LogiFlow está em conformidade com a LGPD?',
]

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#F9FAFB',
          padding: '60px 72px',
          fontFamily: 'sans-serif',
          color: '#111827',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#2563EB',
              color: '#ffffff',
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            L
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#1F2937' }}>LogiFlow</div>
        </div>

        {/* Title */}
        <div style={{ fontSize: 52, fontWeight: 800, color: '#111827', marginBottom: 12, letterSpacing: -1 }}>
          Perguntas Frequentes
        </div>
        <div style={{ fontSize: 24, color: '#6B7280', marginBottom: 40, lineHeight: 1.4 }}>
          Segurança da informação, armazenamento de dados e conformidade com a LGPD.
        </div>

        {/* Question cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {questions.map((q, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                background: '#ffffff',
                border: '1px solid #E5E7EB',
                borderRadius: 14,
                padding: '20px 28px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#EFF6FF',
                  color: '#2563EB',
                  fontSize: 18,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ?
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#1F2937' }}>{q}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 'auto',
            paddingTop: 32,
            borderTop: '1px solid #E5E7EB',
          }}
        >
          <div style={{ fontSize: 20, color: '#9CA3AF' }}>logiflow-app.com.br/faq</div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 20,
              color: '#059669',
              fontWeight: 600,
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 9999, background: '#34D399' }} />
            Conformidade LGPD
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
