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

// ── Fila de localização ──────────────────────────────────────────────────────
// Pings de GPS do entregador (HTTP e WebSocket) são de altíssima frequência e
// descartáveis: persistir cada ponto no caminho da requisição pagava 4 idas ao
// Postgres remoto (~centenas de ms cada). Aqui a requisição só enfileira (1 hop
// ao Redis) e um worker in-process grava/deduplica e detecta chegada fora do
// caminho crítico. Jobs concluídos são removidos na hora (volume alto).
export interface LocationJob {
  delivererId: string
  storeId:     string
  lat:         number
  lng:         number
  recordedAt:  string   // ISO — carimbado no recebimento, não no processamento
}

export const locationQueue = new Queue<LocationJob>('location', {
  connection: makeConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail:     500,
    attempts:         3,
    backoff:          { type: 'exponential', delay: 2_000 },
  },
})

export function createLocationWorker(
  handler: (job: Job<LocationJob>) => Promise<void>
) {
  return new Worker<LocationJob>(
    'location',
    handler,
    { connection: makeConnection(), concurrency: 5 }
  )
}
