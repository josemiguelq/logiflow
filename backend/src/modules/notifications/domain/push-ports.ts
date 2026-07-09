// Domain ports — nothing here knows about FCM, firebase-admin, or any SDK.

export interface PushPayload {
  title: string
  body:  string
  data?: Record<string, string>
}

export interface PushResult {
  successCount: number
  failureCount: number
  // Tokens rejeitados pelo FCM por não existirem mais (app desinstalado/rotacionado).
  invalidTokens: string[]
}

export interface IPushNotificationProvider {
  send(tokens: string[], payload: PushPayload): Promise<PushResult>
}

export interface IDeviceTokenRepository {
  upsert(delivererId: string, token: string, platform: 'android' | 'ios'): Promise<void>
  findByDeliverer(delivererId: string): Promise<string[]>
  findByDeliverers(delivererIds: string[]): Promise<string[]>
  findByStore(storeId: string): Promise<string[]>
  delete(token: string): Promise<void>
  deleteMany(tokens: string[]): Promise<void>
}
