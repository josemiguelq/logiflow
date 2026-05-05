import { StoreUser, Deliverer } from '../domain/entities'

export interface IStoreUserRepository {
  findByEmail(email: string): Promise<StoreUser | null>
  findById(id: string): Promise<StoreUser | null>
  create(data: Omit<StoreUser, 'id' | 'createdAt'>): Promise<StoreUser>
}

export interface IDelivererAuthRepository {
  findByUsername(username: string): Promise<Deliverer | null>
  findById(id: string): Promise<Deliverer | null>
}
