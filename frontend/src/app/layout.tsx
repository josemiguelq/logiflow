import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { GoogleAnalytics } from '@next/third-parties/google'
import { ServiceWorkerRegister } from '@/components/pwa/service-worker-register'
import { SITE_URL } from '@/lib/site'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

const gaId = process.env.NEXT_PUBLIC_GA_ID

const title = 'LogiFlow — Gestão de Entregas e Logística Urbana'
const description =
  'LogiFlow é a plataforma de gestão de entregas e logística urbana: pedidos, rotas, rastreamento GPS ao vivo e confirmação de entrega para a sua loja.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  applicationName: 'LogiFlow',
  authors:  [{ name: 'LogiFlow' }],
  creator:  'LogiFlow',
  publisher: 'LogiFlow',
  keywords: [
    'logiflow',
    'logística',
    'gestão de entregas',
    'logística urbana',
    'rastreamento de entregas',
    'roteirização',
    'gestão de entregadores',
  ],
  // Só a landing é canônica/indexável; o restante é bloqueado via robots.ts.
  alternates: { canonical: '/' },
  verification: { google: '4Sx71ffmBoZnMfrVpw4z8u_7ZKN_2O8lX3gF13F4M84' },
  openGraph: {
    // A imagem é gerada automaticamente por src/app/opengraph-image.tsx (1200×630).
    type:        'website',
    siteName:    'LogiFlow',
    title,
    description,
    url:         SITE_URL,
    locale:      'pt_BR',
  },
  twitter: {
    // A imagem é gerada automaticamente por src/app/twitter-image.tsx.
    card:        'summary_large_image',
    title,
    description,
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
