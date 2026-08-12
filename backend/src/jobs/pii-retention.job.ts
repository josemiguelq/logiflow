import type { Job } from './types'
import {
  cleanupPiiData,
  MESSAGE_LOG_RETENTION_DAYS,
  STATUS_HISTORY_RETENTION_DAYS,
} from '../shared/jobs/pii-retention'

const INTERVAL_MS         = Number(process.env.PII_RETENTION_INTERVAL_MS) || 24 * 60 * 60_000
const MESSAGE_LOG_DAYS    = Number(process.env.MESSAGE_LOG_RETENTION_DAYS)    || MESSAGE_LOG_RETENTION_DAYS
const STATUS_HISTORY_DAYS = Number(process.env.STATUS_HISTORY_RETENTION_DAYS) || STATUS_HISTORY_RETENTION_DAYS

// Retenção de PII (message_logs, deliverer_status_history). A lógica pura fica em
// shared/jobs/pii-retention.ts; aqui só embrulhamos como Job.
export const piiRetentionJob: Job = {
  name:       'pii-retention',
  intervalMs: INTERVAL_MS,
  run: async ({ db, log }) => {
    const totals = await cleanupPiiData(db, log, {
      messageLogDays:    MESSAGE_LOG_DAYS,
      statusHistoryDays: STATUS_HISTORY_DAYS,
    })
    log.info(
      { ...totals, messageLogDays: MESSAGE_LOG_DAYS, statusHistoryDays: STATUS_HISTORY_DAYS },
      '[pii-retention] ciclo concluído',
    )
  },
}
