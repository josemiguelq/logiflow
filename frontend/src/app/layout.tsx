import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const gaId = process.env.NEXT_PUBLIC_GA_ID

export const metadata: Metadata = {
  title:       'LogiFlow — Gestão de Entregas',
  description: 'Plataforma de gestão de entregas urbanas',
  // Manifest default (nome "LogiFlow"), usado na tela de login. Após o login, o
  // dynamic-manifest reescreve o <link rel="manifest"> com o nome da loja.
  manifest:    '/pwa-manifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'LogiFlow' },
  icons: {
    icon:  '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#2563EB',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>
        {children}
        <ServiceWorkerRegister />
      </body>
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </html>
  )
}
