'use client'

import { useEffect } from 'react'

// Reescreve o <link rel="manifest"> e os títulos do app com o nome da loja quando o tema
// personalizado está ativo — assim o PWA instalado leva o nome da loja. Fora disso, mantém
// o default "LogiFlow" (/pwa-manifest sem query). Montado no dashboard, onde o tema já é
// carregado; recebe os valores por prop para reaproveitar o mesmo /store/theme.

interface Props {
  storeName:    string | null
  primary:      string | null
  customTheme:  boolean
}

function setMeta(selector: string, attr: 'name' | 'content', value: string) {
  const el = document.querySelector(selector)
  if (el) el.setAttribute(attr, value)
}

export function DynamicManifest({ storeName, primary, customTheme }: Props) {
  // Mesma regra do brandName em (dashboard)/layout.tsx.
  const brandName = customTheme && storeName ? storeName : 'LogiFlow'

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return

    if (customTheme && storeName) {
      const q = new URLSearchParams({ name: storeName })
      if (primary) q.set('color', primary)
      link.href = `/pwa-manifest?${q.toString()}`
    } else {
      link.href = '/pwa-manifest'
    }

    // Título do app / atalho iOS.
    document.title = `${brandName} — Gestão de Entregas`
    setMeta('meta[name="apple-mobile-web-app-title"]', 'content', brandName)
    if (primary) setMeta('meta[name="theme-color"]', 'content', primary)
  }, [brandName, storeName, primary, customTheme])

  return null
}
