import { AutoRouteConfig, RodizioEntry, EnabledAutoRoute } from '../domain/entities'

export interface UpsertAutoRouteConfigInput {
  enabled:     boolean
  waitMinutes: number
  queueSize:   number
  maxOrders:   number | null
  delivererIds: string[]   // rodízio na ordem desejada
}

export interface CreatedAutoRoute {
  routeId:          string
  pickupCode:       string
  assignedOrderIds: string[]
}

export interface IAutoRouteRepository {
  // Config + rodízio (com nome/status dos entregadores) de uma loja.
  getConfig(storeId: string): Promise<AutoRouteConfig | null>
  getRodizio(storeId: string): Promise<RodizioEntry[]>

  // Upsert transacional da config + regravação do rodízio; grava auditoria
  // antes/depois. Retorna a config resultante.
  upsertConfig(
    storeId: string,
    input: UpsertAutoRouteConfigInput,
    actor: { id: string; name: string },
  ): Promise<AutoRouteConfig>

  // Todas as lojas com auto-rotas ativa, já com o rodízio (para o scan).
  listEnabled(): Promise<EnabledAutoRoute[]>

  // Cria a rota, atribui os pedidos e avança o ponteiro do rodízio — tudo numa
  // transação. Revalida cada pedido (ainda PREPARING e sem entregador) e ignora
  // os que já saíram da fila. Retorna os pedidos efetivamente atribuídos.
  createRouteAndAdvance(input: {
    storeId:          string
    delivererId:      string
    orderIds:         string[]
    nextTurnPosition: number
  }): Promise<CreatedAutoRoute>
}
