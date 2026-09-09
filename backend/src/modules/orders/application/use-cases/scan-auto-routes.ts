import type { Queue } from 'bullmq'
import type { IOrderRepository } from '../ports'
import type { NotificationJob } from '../../../../shared/infra/queue'
import type { IAutoRouteRepository } from '../../../auto-routes/application/ports'
import type { RodizioEntry } from '../../../auto-routes/domain/entities'
import { wsHub } from '../../../../shared/infra/websocket'
import { redis } from '../../../../shared/infra/redis'
import { clusterByRegion } from '../../../auto-routes/application/cluster-by-region'

interface Logger {
  info(obj: unknown, msg?: string): void
  warn(obj: unknown, msg?: string): void
  error(obj: unknown, msg?: string): void
}

interface Deps {
  autoRouteRepo:     IAutoRouteRepository
  orderRepo:         IOrderRepository
  notificationQueue: Queue<NotificationJob>
  log:               Logger
}

// Dedup em memória: guarda o "entregador da vez" já avisado por loja, para não
// reenviar o push de "você é o próximo" a cada varredura. Mesma semântica dos
// dedups de scan-delayed-orders (não persiste; um restart pode reenviar).
const lastNextByStore = new Map<string, string>()

// Elegível para receber a rota: online (ativo e não OFFLINE) E sem nenhuma rota
// ativa (CREATED/STARTED). Quem já está rodando uma rota é pulado.
const isEligible = (e: RodizioEntry) => e.isActive && e.status !== 'OFFLINE' && !e.hasActiveRoute

// A partir de startIdx, percorre o rodízio ciclicamente e retorna o primeiro
// entregador elegível (o "entregador da vez"), com seu índice. `exclude` permite
// pular entregadores já escolhidos nesta mesma varredura (para quando várias rotas
// são criadas de uma vez, por causa do agrupamento por região) — o `hasActiveRoute`
// carregado no início do scan ainda não reflete essas atribuições em memória.
function firstEligibleFrom(
  rodizio: RodizioEntry[],
  startIdx: number,
  exclude?: Set<string>,
): { entry: RodizioEntry; idx: number } | null {
  const len = rodizio.length
  for (let k = 0; k < len; k++) {
    const idx = (startIdx + k) % len
    const entry = rodizio[idx]
    if (isEligible(entry) && !exclude?.has(entry.delivererId)) return { entry, idx }
  }
  return null
}

// Coordenada efetiva de entrega de um pedido: prioriza a agência (quando o pedido é
// retirado numa agência), senão o endereço do cliente — já coalescido com
// delivery_lat/lng no SQL de findPreparing (ver COALESCE em pg-order-repo.ts).
function effectiveCoord(o: { agency?: { lat?: number; lng?: number }; customer: { lat?: number; lng?: number } }) {
  return {
    lat: o.agency?.lat ?? o.customer.lat,
    lng: o.agency?.lng ?? o.customer.lng,
  }
}

// Invalida o cache de pedidos da loja bumpando a versão (mesma estratégia do
// orders/interface/routes.ts) — sem `KEYS`, que bloqueia o Redis a cada scan.
async function invalidateStoreOrders(storeId: string) {
  try {
    await redis.incr(`orders:ver:${storeId}`)
  } catch { /* non-fatal */ }
}
async function invalidateDelivererOrders(delivererId: string) {
  try { await redis.del(`orders:deliverer:${delivererId}`) } catch { /* non-fatal */ }
}

/**
 * Varre as lojas com criação automática de rotas ativa. Para cada loja: se a fila
 * de pedidos em Preparando bateu o gatilho (≥ queueSize pedidos OU o mais antigo
 * esperando ≥ waitMinutes), cria rota(s) com esses pedidos atribuída(s) ao
 * "entregador da vez" (rodízio, pulando quem está OFFLINE) e avança o ponteiro.
 * Com `groupByRegion` ativo, os pedidos são antes separados em clusters por
 * proximidade (raio `regionRadiusKm`, encadeado) — 1 rota por cluster, cada uma para
 * um entregador diferente do rodízio; clusters sem entregador elegível ficam
 * PREPARING para a próxima varredura. Independente do gatilho, avisa por push quem
 * virou o próximo do rodízio.
 */
export async function scanAutoRoutes({ autoRouteRepo, orderRepo, notificationQueue, log }: Deps) {
  let configs
  try {
    configs = await autoRouteRepo.listEnabled()
  } catch (err) {
    log.error({ err }, '[auto-route] failed to list enabled configs')
    return
  }

  const liveStores = new Set<string>()

  for (const cfg of configs) {
    liveStores.add(cfg.storeId)
    const rodizio = cfg.rodizio
    const len = rodizio.length
    if (len === 0) { lastNextByStore.delete(cfg.storeId); continue }

    const startIdx = ((cfg.turnPosition % len) + len) % len

    let preparing
    try {
      preparing = await orderRepo.findPreparing(cfg.storeId)
    } catch (err) {
      log.error({ err, storeId: cfg.storeId }, '[auto-route] failed to load preparing orders')
      continue
    }

    const now = Date.now()
    const maxWaitMin = preparing.reduce((max, o) => {
      const mins = (now - new Date(o.createdAt).getTime()) / 60_000
      return mins > max ? mins : max
    }, 0)
    const triggered = preparing.length > 0 &&
      (preparing.length >= cfg.queueSize || maxWaitMin >= cfg.waitMinutes)

    const daVez = firstEligibleFrom(rodizio, startIdx)

    let effectiveStart = startIdx
    const justAssignedIds = new Set<string>()

    if (triggered && daVez) {
      // Sem agrupamento por região: 1 cluster único com todos os pedidos (comportamento
      // de sempre). Com agrupamento: 1 cluster por região próxima (encadeado/single-
      // linkage) — cada cluster vira uma rota, para um entregador diferente do rodízio.
      let clusters: (typeof preparing)[]
      if (cfg.groupByRegion && cfg.regionRadiusKm) {
        const byId = new Map(preparing.map(o => [o.id, o]))
        const idClusters = clusterByRegion(
          preparing.map(o => ({ id: o.id, ...effectiveCoord(o) })),
          cfg.regionRadiusKm,
        )
        clusters = idClusters.map(c => c.map(x => byId.get(x.id)!))
      } else {
        clusters = [preparing]
      }

      let clusterStartIdx = startIdx

      for (const cluster of clusters) {
        const pick = firstEligibleFrom(rodizio, clusterStartIdx, justAssignedIds)
        if (!pick) break // rodízio exaurido nesta varredura — clusters restantes ficam PREPARING para a próxima

        const cap = cfg.maxOrders ?? cluster.length
        const orderIds = cluster.slice(0, cap).map(o => o.id)
        const nextTurn = (pick.idx + 1) % len

        try {
          const result = await autoRouteRepo.createRouteAndAdvance({
            storeId:          cfg.storeId,
            delivererId:      pick.entry.delivererId,
            orderIds,
            nextTurnPosition: nextTurn,
          })

          if (result.assignedOrderIds.length > 0) {
            effectiveStart = nextTurn   // ponteiro avançou só quando a rota foi criada
            clusterStartIdx = nextTurn
            justAssignedIds.add(pick.entry.delivererId)

            // Push ao entregador da vez (sem pedido — mensagem genérica de rota).
            await notificationQueue.add('push', {
              type:        'push',
              delivererId: pick.entry.delivererId,
              storeId:     cfg.storeId,
              statusEvent: 'AUTO_ROUTE_ASSIGNED',
            })

            // Atualiza painel (WS) + notifica cliente (WhatsApp), como no batch-assign.
            const elected: Array<{ orderId: string; customerName: string; lat?: number; lng?: number }> = []
            for (const orderId of result.assignedOrderIds) {
              const order = await orderRepo.findById(orderId, cfg.storeId)
              if (order) {
                wsHub.broadcastOrderUpdate(cfg.storeId, order)
                const coord = effectiveCoord(order)
                elected.push({ orderId: order.id, customerName: order.customer.name, lat: coord.lat, lng: coord.lng })
              }
              notificationQueue.add('status_changed', {
                type: 'whatsapp', storeId: cfg.storeId, orderId, statusEvent: 'ASSIGNED',
              }).catch(() => { /* non-fatal */ })
            }

            // Popup no painel do operador: quais pedidos foram eleitos e que ele
            // deve separá-los agora para entregar ao entregador da vez.
            wsHub.broadcastToStore(cfg.storeId, 'auto_route_created', {
              routeId:       result.routeId,
              pickupCode:    result.pickupCode,
              delivererName: pick.entry.name,
              orders:        elected,
            })

            await invalidateStoreOrders(cfg.storeId)
            await invalidateDelivererOrders(pick.entry.delivererId)

            log.info(
              { storeId: cfg.storeId, routeId: result.routeId, delivererId: pick.entry.delivererId, orders: result.assignedOrderIds.length },
              '[auto-route] route created',
            )
          } else {
            log.info({ storeId: cfg.storeId }, '[auto-route] triggered but no eligible orders (all taken)')
          }
        } catch (err) {
          log.error({ err, storeId: cfg.storeId }, '[auto-route] failed to create route')
        }
      }
    }

    // Push proativo "você é o próximo" a quem virou o entregador da vez.
    const daVezAfter = firstEligibleFrom(rodizio, effectiveStart, justAssignedIds)
    if (daVezAfter) {
      const prev = lastNextByStore.get(cfg.storeId)
      const nextId = daVezAfter.entry.delivererId
      if (nextId !== prev) {
        notificationQueue.add('push', {
          type:        'push',
          delivererId: nextId,
          storeId:     cfg.storeId,
          statusEvent: 'AUTO_ROUTE_NEXT',
        }).catch(() => { /* non-fatal */ })
        log.info({ storeId: cfg.storeId, delivererId: nextId }, '[auto-route] next-up notified')
      }
      lastNextByStore.set(cfg.storeId, nextId)
    } else {
      // Ninguém online — ao voltar alguém, notifica de novo.
      lastNextByStore.delete(cfg.storeId)
    }
  }

  // Limpa lojas que desativaram a feature.
  for (const storeId of lastNextByStore.keys()) {
    if (!liveStores.has(storeId)) lastNextByStore.delete(storeId)
  }
}
