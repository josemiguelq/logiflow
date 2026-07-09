import type { Metadata } from 'next'

// Links curtos de rastreio por token, compartilhados com o cliente.
// Bloqueio explícito de indexação — reforça o Disallow do robots.ts.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function GLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
