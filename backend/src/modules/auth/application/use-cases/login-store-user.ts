import bcrypt from 'bcryptjs'
import { IStoreUserRepository } from '../ports'

interface Deps {
  storeUserRepo: IStoreUserRepository
  signJwt: (payload: object) => string
}

export async function loginStoreUser(
  { email, password }: { email: string; password: string },
  { storeUserRepo, signJwt }: Deps
) {
  const user = await storeUserRepo.findByEmail(email)
  if (!user || !user.active) throw new Error('Invalid credentials')

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) throw new Error('Invalid credentials')

  const token = signJwt({
    type: 'store_user',
    sub: user.id,
    storeId: user.storeId,
    role: user.role,
    name: user.name,
  })

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
    },
  }
}
