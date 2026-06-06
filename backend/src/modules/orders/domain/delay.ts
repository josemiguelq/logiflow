// Lógica central de atraso de pedidos (fonte única da verdade).
// Expressa em SQL para ser reaproveitada por qualquer query que liste pedidos,
// resolvendo os limiares (minutos) configurados por loja em store_setting_values
// (com fallback para o default do catálogo de settings).

export type DelayLevel = 'none' | 'yellow' | 'red'

// Subquery que resolve um limiar de atraso para a loja do pedido.
function threshold(name: string, fallback: string, o: string): string {
  return `COALESCE(
    (SELECT ssv.value FROM store_setting_values ssv
       JOIN settings s ON s.id = ssv.setting_id
     WHERE s.name = '${name}' AND ssv.store_id = ${o}.store_id),
    (SELECT default_value FROM settings WHERE name = '${name}'),
    '${fallback}')::numeric`
}

/**
 * Expressão SQL que devolve o nível de atraso ('none' | 'yellow' | 'red') do
 * pedido com alias [o] (precisa expor o.status, o.created_at, o.picked_up_at, o.store_id).
 * - PREPARING: tempo desde created_at.
 * - ON_ROUTE / OUT_FOR_DELIVERY (com picked_up_at): tempo desde picked_up_at.
 */
export function delayLevelSql(o = 'o'): string {
  const prepMin  = `(EXTRACT(EPOCH FROM (now() - ${o}.created_at)) / 60)`
  const transMin = `(EXTRACT(EPOCH FROM (now() - ${o}.picked_up_at)) / 60)`
  return `CASE
    WHEN ${o}.status = 'PREPARING' THEN
      CASE WHEN ${prepMin} >= ${threshold('delay_prep_red_min', '30', o)}    THEN 'red'
           WHEN ${prepMin} >= ${threshold('delay_prep_yellow_min', '20', o)} THEN 'yellow'
           ELSE 'none' END
    WHEN ${o}.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY') AND ${o}.picked_up_at IS NOT NULL THEN
      CASE WHEN ${transMin} >= ${threshold('delay_transit_red_min', '60', o)}    THEN 'red'
           WHEN ${transMin} >= ${threshold('delay_transit_yellow_min', '50', o)} THEN 'yellow'
           ELSE 'none' END
    ELSE 'none'
  END`
}

/** Minutos decorridos na fase atual (ou NULL se a fase não conta atraso). */
export function delayMinutesSql(o = 'o'): string {
  return `CASE
    WHEN ${o}.status = 'PREPARING'
      THEN FLOOR(EXTRACT(EPOCH FROM (now() - ${o}.created_at)) / 60)
    WHEN ${o}.status IN ('ON_ROUTE', 'OUT_FOR_DELIVERY') AND ${o}.picked_up_at IS NOT NULL
      THEN FLOOR(EXTRACT(EPOCH FROM (now() - ${o}.picked_up_at)) / 60)
    ELSE NULL
  END`
}
