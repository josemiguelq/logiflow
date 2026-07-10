import 'dotenv/config'
import pino from 'pino'
import { db } from '../shared/db/client'
import { cleanupLocationHistory, LOCATION_RETENTION_DAYS } from '../shared/jobs/location-retention'

// Service separado (EasyPanel) para a poda de location_history, usando o mesmo
// codebase/imagem do backend — só muda o comando de start. Foi tirado do
// server.ts para não competir com o processo web e escalar de forma isolada.
//
// Modos:
//   - Serviço contínuo (padrão): roda já no boot e depois a cada
//     LOCATION_RETENTION_INTERVAL_MS (default 24h). Erros não derrubam o serviço.
//   - Cron/one-shot (RUN_ONCE=true): roda uma vez e sai (0 = ok, 1 = erro),
//     para agendar como Cron Job do EasyPanel.
const log = pino({ name: 'location-retention' })

const INTERVAL_MS = Number(process.env.LOCATION_RETENTION_INTERVAL_MS) || 24 * 60 * 60_000
const RUN_ONCE    = process.env.RUN_ONCE === 'true'
const RETENTION_DAYS = Number(process.env.LOCATION_RETENTION_DAYS) || LOCATION_RETENTION_DAYS

// New Relic (logs): com o Dockerfile subindo `-r newrelic` e licença configurada,
// o agente instrumenta o pino e encaminha os logs para o New Relic. Guardamos o
// handle só para dar `shutdown` (flush) antes de sair — senão os últimos logs do
// modo one-shot podem não ser enviados. Em dev (tsx, sem licença) fica no-op.
interface NewRelicLike {
  shutdown(opts: { collectPendingData?: boolean; timeout?: number }, cb: () => void): void
}
let newrelic: NewRelicLike | null = null
if (process.env.NEW_RELIC_LICENSE_KEY) {
  try {
    newrelic = require('newrelic') as NewRelicLike
  } catch {
    newrelic = null
  }
}

async function runOnce(): Promise<void> {
  const start = Date.now()
  const total = await cleanupLocationHistory(db, log, RETENTION_DAYS)
  log.info(
    { total, ms: Date.now() - start, retentionDays: RETENTION_DAYS },
    '[location-retention] ciclo concluído',
  )
}

// Descarrega o agente do New Relic (flush dos logs pendentes) antes de encerrar,
// para não perder o último ciclo no modo one-shot / no SIGTERM.
function exit(code: number): void {
  if (!newrelic) process.exit(code)
  else newrelic.shutdown({ collectPendingData: true, timeout: 5_000 }, () => process.exit(code))
}

async function main(): Promise<void> {
  if (RUN_ONCE) {
    try {
      await runOnce()
      exit(0)
    } catch (err) {
      log.error({ err }, '[location-retention] falhou')
      exit(1)
    }
    return
  }

  // Serviço contínuo: primeiro ciclo já no boot, depois no intervalo. Um erro num
  // ciclo apenas loga — o próximo tenta de novo.
  const tick = () =>
    runOnce().catch((err) => log.error({ err }, '[location-retention] ciclo falhou'))
  await tick()
  const timer = setInterval(tick, INTERVAL_MS)

  const shutdown = (sig: string) => {
    log.info({ sig }, '[location-retention] encerrando')
    clearInterval(timer)
    exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))

  log.info({ intervalMs: INTERVAL_MS, retentionDays: RETENTION_DAYS }, '[location-retention] serviço iniciado')
}

void main()
