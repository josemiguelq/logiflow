import type { DB } from '../db/client'

// Retenção de location_history (tabela de maior volume de escrita: ~ping GPS a
// cada 15s por entregador, sem TTL). Além disso o tracking fica lento e o backup
// infla. Roda hoje num service separado (job:location-retention).
export const LOCATION_RETENTION_DAYS = 14

interface Logger {
  info:  (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

/**
 * Poda location_history além de `retentionDays` dias. Deleta em lotes (ctid) para
 * não abrir uma transação gigante nem travar o Postgres remoto. Não precisa de
 * índice em recorded_at: a tabela é append-only (BIGSERIAL), então as linhas
 * antigas ficam no início do heap e o filtro por tempo acha o lote na hora.
 *
 * Retorna quantas linhas removeu. Lança em caso de erro (o chamador decide se
 * derruba o processo — modo one-shot — ou apenas loga e tenta no próximo ciclo).
 */
export async function cleanupLocationHistory(
  db: DB,
  log: Logger,
  retentionDays: number = LOCATION_RETENTION_DAYS,
): Promise<number> {
  const BATCH = 10_000
  const MAX_BATCHES = 200 // teto de ~2M linhas/execução; o resto sai no próximo ciclo
  let total = 0
  for (let i = 0; i < MAX_BATCHES; i++) {
    const { rowCount } = await db.query(
      `DELETE FROM location_history
         WHERE ctid IN (
           SELECT ctid FROM location_history
           WHERE recorded_at < now() - make_interval(days => $1)
           LIMIT ${BATCH}
         )`,
      [retentionDays],
    )
    total += rowCount ?? 0
    if (!rowCount || rowCount < BATCH) break
    await new Promise((r) => setTimeout(r, 200)) // respiro entre lotes
  }
  if (total > 0) log.info({ total }, '[location-retention] linhas antigas removidas')
  return total
}
