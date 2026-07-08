// Configuração de criação automática de rotas por loja.
export interface AutoRouteConfig {
  storeId:      string
  enabled:      boolean
  waitMinutes:  number   // gatilho: pedido mais antigo em Preparando há ≥ waitMinutes
  queueSize:    number   // gatilho: ≥ queueSize pedidos em Preparando
  maxOrders:    number | null  // cap opcional de pedidos por rota (null = todos)
  turnPosition: number   // ponteiro do rodízio (índice, 0-based)
  updatedAt:    Date
}

// Entrada do rodízio: um entregador e sua posição na ordem, com o status atual
// (para o scan pular quem está OFFLINE ao escolher o "entregador da vez").
export interface RodizioEntry {
  delivererId: string
  position:    number
  name:        string
  status:      string   // AVAILABLE | ON_ROUTE | OFFLINE
  isActive:    boolean
}

// Config + rodízio de uma loja com auto-rotas ativa (consumido pelo scan).
export interface EnabledAutoRoute extends AutoRouteConfig {
  rodizio: RodizioEntry[]
}
