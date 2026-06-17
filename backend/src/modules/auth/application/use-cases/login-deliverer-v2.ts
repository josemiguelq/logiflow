import bcrypt from 'bcryptjs'
import { IDelivererAuthRepository } from '../ports'

interface Store { id: string; name: string; code: string }

interface Deps {
  delivererRepo: IDelivererAuthRepository
  findStoreByCode: (code: string) => Promise<Store | null>
  signJwt: (payload: object) => string
}

// Login v2: o entregador escolhe a loja pelo código de convite e entra com
// username + senha daquela loja. O username é único por loja, então a mesma
// pessoa pode existir em lojas diferentes. (A v1 continua intocada.)
export async function loginDelivererV2(
  { storeCode, username, password }: { storeCode: string; username: string; password: string },
  { delivererRepo, findStoreByCode, signJwt }: Deps
) {
  const store = await findStoreByCode(storeCode.trim().toUpperCase())
  if (!store) throw new Error('Invalid credentials')

  const deliverer = await delivererRepo.findByStoreAndUsername(store.id, username)
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
      id:              deliverer.id,
      name:            deliverer.name,
      username:        deliverer.username,
      storeId:         deliverer.storeId,
      status:          deliverer.status,
      profileImageUrl: deliverer.profileImageUrl,
      needsOnboarding: deliverer.needsOnboarding,
    },
    store: { id: store.id, name: store.name, code: store.code },
  }
}
