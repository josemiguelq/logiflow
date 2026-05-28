import admin from 'firebase-admin'
import type { IPushNotificationProvider, PushPayload } from '../../domain/push-ports'

let initialised = false

function ensureInit() {
  if (initialised) return
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var is not set')
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) })
  initialised = true
}

export function createFcmProvider(): IPushNotificationProvider {
  return {
    async send(tokens: string[], payload: PushPayload) {
      if (tokens.length === 0) return { successCount: 0, failureCount: 0 }
      ensureInit()
      const result = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: payload.title, body: payload.body },
        data:         payload.data ?? {},
        android:      { priority: 'high' },
        apns:         { payload: { aps: { sound: 'default', badge: 1 } } },
      })

      const invalidTokens: string[] = []
      result.responses.forEach((resp, i) => {
        if (!resp.success) {
          const code = resp.error?.code ?? ''
          console.log(`[FCM] token[${i}] failed: code=${code} message=${resp.error?.message}`)
          if (
            code === 'messaging/registration-token-not-registered' ||
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/invalid-argument' ||
            code === 'messaging/unregistered'
          ) {
            invalidTokens.push(tokens[i]!)
          }
        }
      })

      return { successCount: result.successCount, failureCount: result.failureCount, invalidTokens }
    },
  }
}
