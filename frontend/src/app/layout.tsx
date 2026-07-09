import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { SITE_URL } from '@/lib/site'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const gaId = process.env.NEXT_PUBLIC_GA_ID

const title = 'LogiFlow — Gestão de Entregas'
const description =
  'Plataforma de gestão de entregas urbanas: pedidos, rotas, rastreamento GPS ao vivo e confirmação de entrega para a sua loja.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  // Só a landing é canônica/indexável; o restante é bloqueado via robots.ts.
  alternates: { canonical: '/' },
  verification: { google: '4Sx71ffmBoZnMfrVpw4z8u_7ZKN_2O8lX3gF13F4M84' },
  openGraph: {
    type:        'website',
    siteName:    'LogiFlow',
    title,
    description,
    url:         SITE_URL,
    locale:      'pt_BR',
    images:      [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'LogiFlow' }],
  },
  twitter: {
    card:        'summary',
    title,
    description,
    images:      ['/icons/icon-512.png'],
  },
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
