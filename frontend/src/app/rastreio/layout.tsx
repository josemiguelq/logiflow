import type { Metadata } from 'next'

// Links de rastreio por token são compartilhados com o cliente (WhatsApp/link).
// Bloqueio explícito de indexação — reforça o Disallow do robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function RastreioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
