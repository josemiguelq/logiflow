// Domain ports — nothing here knows about FCM, firebase-admin, or any SDK.

export interface PushPayload {
  title: string
  body:  string
  data?: Record<string, string>
}

export interface IPushNotificationProvider {
  send(tokens: string[], payload: PushPayload): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }>
}

export interface IDeviceTokenRepository {
  upsert(delivererId: string, token: string, platform: 'android' | 'ios'): Promise<void>
  findByDeliverer(delivererId: string): Promise<string[]>
  findByStore(storeId: string): Promise<string[]>
  delete(token: string): Promise<void>
}
