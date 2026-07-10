import 'dotenv/config'
import pino from 'pino'
import { db } from '../shared/db/client'
import { jobs as allJobs } from './registry'
import type { Job } from './types'

// Runner genérico de workers (EasyPanel), usando o mesmo codebase/imagem do
// backend — só muda o comando de start. Um único service pode rodar TODOS os
// jobs registrados em ./registry (hoje: location-retention).
//
// Seleção (env WORKERS):
//   - "all" (default) → roda todos os jobs registrados.
//   - lista por vírgula (ex.: "location-retention,outro-job") → roda só esses.
// Modos:
//   - Serviço contínuo (default): cada job roda no boot e depois no seu intervalo.
//   - Cron/one-shot (RUN_ONCE=true): roda os selecionados uma vez e sai (0 = ok,
//     1 = algum job falhou), para agendar como Cron Job do EasyPanel.
const log = pino({ name: 'worker' })

const RUN_ONCE  = process.env.RUN_ONCE === 'true'
const selection = (process.env.WORKERS ?? 'all').trim()
const wanted    = selection === 'all'
  ? null
  : new Set(selection.split(',').map(s => s.trim()).filter(Boolean))
const selected: Job[] = wanted ? allJobs.filter(j => wanted.has(j.name)) : allJobs

// New Relic (logs): com o Dockerfile subindo `-r newrelic` e licença configurada,
// o agente instrumenta o pino e encaminha os logs. Guardamos o handle só para dar
// `shutdown` (flush) antes de sair — senão os últimos logs (one-shot/SIGTERM)
// podem não ser enviados. Em dev (tsx, sem licença) fica no-op.
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

function exit(code: number): void {
  if (!newrelic) process.exit(code)
  else newrelic.shutdown({ collectPendingData: true, timeout: 5_000 }, () => process.exit(code))
}

async function runJob(job: Job): Promise<void> {
  const jobLog = log.child({ job: job.name })
  const start = Date.now()
  try {
    await job.run({ db, log: jobLog })
    jobLog.info({ ms: Date.now() - start }, '[worker] job concluído')
  } catch (err) {
    jobLog.error({ err, ms: Date.now() - start }, '[worker] job falhou')
    throw err
  }
}

async function main(): Promise<void> {
  if (selected.length === 0) {
    log.error({ selection, disponiveis: allJobs.map(j => j.name) }, '[worker] nenhum job selecionado')
    exit(1)
    return
  }

  if (RUN_ONCE) {
    const results = await Promise.allSettled(selected.map(runJob))
    exit(results.some(r => r.status === 'rejected') ? 1 : 0)
    return
  }

  // Serviço contínuo: cada job roda já no boot (sequencial, pra não sobrecarregar
  // o boot) e depois no seu próprio intervalo. Um erro num ciclo só loga.
  const timers: ReturnType<typeof setInterval>[] = []
  for (const job of selected) {
    await runJob(job).catch(() => { /* já logado */ })
    timers.push(setInterval(() => { void runJob(job).catch(() => { /* já logado */ }) }, job.intervalMs))
  }

  const shutdown = (sig: string) => {
    log.info({ sig }, '[worker] encerrando')
    timers.forEach(clearInterval)
    exit(0)
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))

  log.info({ jobs: selected.map(j => j.name) }, '[worker] serviço iniciado')
}

void main()
