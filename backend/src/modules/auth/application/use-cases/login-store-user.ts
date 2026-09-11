import bcrypt from 'bcryptjs'
import { IStoreUserRepository } from '../ports'

interface Deps {
  storeUserRepo: IStoreUserRepository
  signJwt: (payload: object) => string
  getScopes: (storeId: string, role: string) => Promise<string[]>
}

export async function loginStoreUser(
  { email, password, jti }: { email: string; password: string; jti: string },
  { storeUserRepo, signJwt, getScopes }: Deps
) {
  const user = await storeUserRepo.findByEmail(email)
  if (!user || !user.active) throw new Error('Invalid credentials')
  // Usuário só-Google (sem senha) não pode logar por senha.
  if (!user.passwordHash) throw new Error('Invalid credentials')

  const [valid, scopes] = await Promise.all([
    bcrypt.compare(password, user.passwordHash),
    getScopes(user.storeId, user.role),
  ])
  if (!valid) throw new Error('Invalid credentials')

  const token = signJwt({
    type:    'store_user',
    sub:     user.id,
    storeId: user.storeId,
    role:    user.role,
    name:    user.name,
    scopes,
    jti,    // id da sessão (rastreio/revogação)
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
