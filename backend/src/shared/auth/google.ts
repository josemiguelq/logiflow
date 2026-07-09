// Verificação do ID token do Google (OIDC). Usado apenas no momento do login/cadastro
// para autenticar a identidade — depois descartamos o token e seguimos com o nosso JWT.
import { OAuth2Client } from 'google-auth-library'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''

// Reutiliza um único client (cacheia as chaves públicas do Google internamente).
const client = new OAuth2Client(GOOGLE_CLIENT_ID)

export interface GoogleIdentity {
  email: string
  sub:   string   // id estável do usuário no Google
  name:  string
}

// Verifica assinatura + audience (nosso GOOGLE_CLIENT_ID) e extrai a identidade.
// Não bloqueia por email_verified (decisão de produto). Lança erro limpo se inválido.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Google login não configurado')

  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })
  const payload = ticket.getPayload()
  if (!payload?.email || !payload.sub) throw new Error('Token Google inválido')

  return {
    email: payload.email.toLowerCase(),
    sub:   payload.sub,
    name:  payload.name ?? payload.email.split('@')[0]!,
  }
}
