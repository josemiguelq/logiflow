import { IStoreUserRepository } from '../ports'

// Erro tipado para a rota diferenciar "e-mail não cadastrado" (403) de outras falhas.
export const EMAIL_NOT_REGISTERED = 'EMAIL_NOT_REGISTERED'

interface Deps {
  storeUserRepo: IStoreUserRepository
  signJwt: (payload: object) => string
  getScopes: (storeId: string, role: string) => Promise<string[]>
}

// Login via Google: a identidade (email/sub) já foi verificada a partir do ID token.
// Só autentica usuários previamente cadastrados (pelo owner) — não cria usuário aqui.
export async function loginStoreUserGoogle(
  { email, sub, jti }: { email: string; sub: string; jti: string },
  { storeUserRepo, signJwt, getScopes }: Deps
) {
  const user = await storeUserRepo.findByEmail(email)
  if (!user) throw new Error(EMAIL_NOT_REGISTERED)
  if (!user.active) throw new Error('Invalid credentials')

  // Vincula a conta Google na primeira vez; se já vinculada, exige o mesmo sub.
  if (!user.googleSub) {
    await storeUserRepo.bindGoogleSub(user.id, sub)
  } else if (user.googleSub !== sub) {
    throw new Error('Invalid credentials')
  }

  const scopes = await getScopes(user.storeId, user.role)

  const token = signJwt({
    type:    'store_user',
    sub:     user.id,
    storeId: user.storeId,
    role:    user.role,
    name:    user.name,
    scopes,
    jti,    // id da sessão (rastreio/revogação) — igual ao login por senha
  })

  return {
    token,
    user: {
      id:      user.id,
      name:    user.name,
      email:   user.email,
      role:    user.role,
      storeId: user.storeId,
      scopes,
    },
  }
}
