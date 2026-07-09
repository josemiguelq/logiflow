import { StoreUser, Deliverer } from '../domain/entities'

export interface IStoreUserRepository {
  findByEmail(email: string): Promise<StoreUser | null>
  findById(id: string): Promise<StoreUser | null>
  create(data: Omit<StoreUser, 'id' | 'createdAt'>): Promise<StoreUser>
  // Vincula a conta Google a um usuário (na primeira vez que ele loga com Google).
  bindGoogleSub(id: string, googleSub: string): Promise<void>
}

export interface IDelivererAuthRepository {
  findByUsername(username: string): Promise<Deliverer | null>
  findByStoreAndUsername(storeId: string, username: string): Promise<Deliverer | null>
  findById(id: string): Promise<Deliverer | null>
}
