import bcrypt from 'bcryptjs'
import { IDelivererAuthRepository } from '../ports'

interface Deps {
  delivererRepo: IDelivererAuthRepository
  signJwt: (payload: object) => string
}

export async function loginDeliverer(
  { username, password }: { username: string; password: string },
  { delivererRepo, signJwt }: Deps
) {
  const deliverer = await delivererRepo.findByUsername(username)
  if (!deliverer) throw new Error('Invalid credentials')

  const valid = await bcrypt.compare(password, deliverer.passwordHash)
  if (!valid) throw new Error('Invalid credentials')

  const token = signJwt({
    type: 'deliverer',
    sub: deliverer.id,
    storeId: deliverer.storeId,
    name: deliverer.name,
  })

  return {
    token,
    deliverer: {
      id: deliverer.id,
      name: deliverer.name,
      username: deliverer.username,
      storeId: deliverer.storeId,
      status: deliverer.status,
      profileImageUrl: deliverer.profileImageUrl,
    },
  }
}
