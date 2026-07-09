'use client'

import { GoogleOAuthProvider } from '@react-oauth/google'

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  // Sem client id configurado, renderiza normalmente (o botão Google fica oculto).
  if (!GOOGLE_CLIENT_ID) return <>{children}</>
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {children}
    </GoogleOAuthProvider>
  )
}
