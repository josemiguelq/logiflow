// Configuração de criação automática de rotas por loja.
export interface AutoRouteConfig {
  storeId:      string
  enabled:      boolean
  waitMinutes:  number   // gatilho: pedido mais antigo em Preparando há ≥ waitMinutes
  queueSize:    number   // gatilho: ≥ queueSize pedidos em Preparando
  maxOrders:    number | null  // cap opcional de pedidos por rota (null = todos)
  groupByRegion:  boolean        // se true, separa os pedidos em clusters por proximidade (1 rota por cluster)
  regionRadiusKm: number | null  // raio (km) usado no clustering quando groupByRegion = true
  turnPosition: number   // ponteiro do rodízio (índice, 0-based)
  updatedAt:    Date
}

// Entrada do rodízio: um entregador e sua posição na ordem, com o status atual
// (para o scan pular quem está OFFLINE ou com rota ativa ao escolher o
// "entregador da vez").
export interface RodizioEntry {
  delivererId:    string
  position:       number
  name:           string
  status:         string   // AVAILABLE | ON_ROUTE | OFFLINE
  isActive:       boolean
  hasActiveRoute: boolean  // possui rota não finalizada (CREATED | STARTED)
}

// Config + rodízio de uma loja com auto-rotas ativa (consumido pelo scan).
// storeLat/storeLng vêm de `stores` — usados para sequenciar as paradas da
// rota por proximidade (nearest neighbor a partir da loja).
export interface EnabledAutoRoute extends AutoRouteConfig {
  storeLat: number | null
  storeLng: number | null
  rodizio:  RodizioEntry[]
}
