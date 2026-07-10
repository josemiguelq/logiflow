import type { Job } from './types'
import { cleanupLocationHistory, LOCATION_RETENTION_DAYS } from '../shared/jobs/location-retention'

const INTERVAL_MS    = Number(process.env.LOCATION_RETENTION_INTERVAL_MS) || 24 * 60 * 60_000
const RETENTION_DAYS = Number(process.env.LOCATION_RETENTION_DAYS) || LOCATION_RETENTION_DAYS

// Poda de location_history (retenção). A lógica pura fica em
// shared/jobs/location-retention.ts; aqui só embrulhamos como Job.
export const locationRetentionJob: Job = {
  name:       'location-retention',
  intervalMs: INTERVAL_MS,
  run: async ({ db, log }) => {
    const total = await cleanupLocationHistory(db, log, RETENTION_DAYS)
    log.info({ total, retentionDays: RETENTION_DAYS }, '[location-retention] ciclo concluído')
  },
}
