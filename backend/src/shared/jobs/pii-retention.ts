import type { DB } from '../db/client'

// Retenção de dados pessoais (LGPD, art. 15/16: minimização temporal). Tabelas
// que acumulam PII sem TTL próprio e não têm valor de negócio depois de um tempo:
//
//   - message_logs            → telefone + conteúdo da mensagem enviada ao cliente
//   - deliverer_status_history → pontos de GPS pontuais no histórico de status
//
// location_history tem seu próprio job (janela curta, alto volume — ver
// shared/jobs/location-retention.ts). Comprovantes (proof_of_delivery) NÃO entram
// aqui: têm valor de prova de entrega e exigem apagar o arquivo no storage junto,
// com uma decisão de prazo legal própria — ficam para um job dedicado.
export const MESSAGE_LOG_RETENTION_DAYS    = 90
export const STATUS_HISTORY_RETENTION_DAYS = 90

interface Logger {
  info:  (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

// Poda uma tabela append-only por uma coluna de tempo, em lotes (ctid) para não
// abrir uma transação gigante nem travar o Postgres remoto — mesma estratégia do
// location-retention. Retorna quantas linhas removeu.
async function pruneByAge(
  db: DB,
  table: string,
  timeColumn: string,
  retentionDays: number,
): Promise<number> {
  const BATCH = 10_000
  const MAX_BATCHES = 200 // teto de ~2M linhas/execução; o resto sai no próximo ciclo
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { rowCount } = await db.query(
      `DELETE FROM ${table}
         WHERE ctid IN (
           SELECT ctid FROM ${table}
           WHERE ${timeColumn} < now() - make_interval(days => $1)
           LIMIT ${BATCH}
         )`,
      [retentionDays],
    )
    total += rowCount ?? 0
    if (!rowCount || rowCount < BATCH) break
    await new Promise((r) => setTimeout(r, 200)) // respiro entre lotes
  }
  return total
}

export interface PiiRetentionOptions {
  messageLogDays?:    number
  statusHistoryDays?: number
}

/**
 * Aplica a política de retenção de PII. Cada tabela usa sua própria janela
 * (configurável por env no wrapper). Lança em caso de erro — o chamador decide se
 * derruba o processo (one-shot) ou apenas loga e tenta no próximo ciclo.
 */
export async function cleanupPiiData(
  db: DB,
  log: Logger,
  opts: PiiRetentionOptions = {},
): Promise<{ messageLogs: number; statusHistory: number }> {
  const messageLogDays    = opts.messageLogDays    ?? MESSAGE_LOG_RETENTION_DAYS
  const statusHistoryDays = opts.statusHistoryDays ?? STATUS_HISTORY_RETENTION_DAYS

  const messageLogs   = await pruneByAge(db, 'message_logs',             'created_at', messageLogDays)
  const statusHistory = await pruneByAge(db, 'deliverer_status_history', 'changed_at', statusHistoryDays)

  if (messageLogs > 0 || statusHistory > 0) {
    log.info({ messageLogs, statusHistory }, '[pii-retention] linhas antigas removidas')
  }
  return { messageLogs, statusHistory }
}
