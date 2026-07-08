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
      orderId?:     string   // opcional: eventos sem pedido (ex.: AUTO_ROUTE_NEXT)
      storeId:      string
      statusEvent:  string
    }
  | {
      type:         'pickup_reminder'
      storeId:      string
      delivererIds: string[]
      count:        number
      minutes:      number
    }
  | {
      // Entregador acabou de concluir a rota e há pedidos prontos esperando.
      type:        'route_done_waiting'
      storeId:     string
      delivererId: string
      count:       number
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
