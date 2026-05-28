import { Queue, Worker, Job } from 'bullmq'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

// BullMQ precisa de conexões próprias — não compartilha com o cliente geral
function makeConnection() {
  const url = new URL(REDIS_URL)
  return {
    host:                 url.hostname,
    port:                 Number(url.port) || 6379,
    password:             url.password || undefined,
    family:               4,
    maxRetriesPerRequest: null,
  }
}

export const notificationQueue = new Queue('notifications', { connection: makeConnection() })

export type NotificationJob =
  | {
      type:        'whatsapp'
      storeId:     string
      orderId:     string
      statusEvent: string
    }
  | {
      type:         'push'
      delivererId?: string
      orderId:      string
      storeId:      string
      statusEvent:  string
    }

export function createNotificationWorker(
  handler: (job: Job<NotificationJob>) => Promise<void>
) {
  return new Worker<NotificationJob>(
    'notifications',
    handler,
    { connection: makeConnection(), concurrency: 5 }
  )
}
