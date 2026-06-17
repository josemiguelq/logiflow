import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const gaId = process.env.NEXT_PUBLIC_GA_ID

export const metadata: Metadata = {
  title:       'LogiFlow — Gestão de Entregas',
  description: 'Plataforma de gestão de entregas urbanas',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  )
}
