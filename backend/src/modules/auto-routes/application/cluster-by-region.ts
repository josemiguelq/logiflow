import { haversineMeters } from '../../../shared/utils/geo'

export interface ClusterableOrder {
  id:   string
  lat?: number
  lng?: number
}

// Agrupa pedidos por proximidade geográfica (single-linkage / encadeado): dois
// pedidos entram no mesmo grupo se a distância entre eles for <= radiusKm, e essa
// relação se propaga em cadeia (A perto de B, B perto de C => A, B e C no mesmo
// grupo, mesmo que A e C estejam distantes entre si).
//
// Pedidos sem lat/lng nunca entram em union com nenhum outro — ficam sempre
// isolados no próprio grupo, já que não é possível saber se estão próximos.
//
// A ordem dos grupos retornados segue a ordem de 1ª aparição em `orders`.
export function clusterByRegion<T extends ClusterableOrder>(orders: T[], radiusKm: number): T[][] {
  const n = orders.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) x = parent[x]
    return x
  }
  function union(a: number, b: number) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  const radiusM = radiusKm * 1000
  for (let i = 0; i < n; i++) {
    const oi = orders[i]
    if (oi.lat == null || oi.lng == null) continue
    for (let j = i + 1; j < n; j++) {
      const oj = orders[j]
      if (oj.lat == null || oj.lng == null) continue
      if (haversineMeters(oi.lat, oi.lng, oj.lat, oj.lng) <= radiusM) union(i, j)
    }
  }

  const groups = new Map<number, T[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    const list = groups.get(root)
    if (list) list.push(orders[i])
    else groups.set(root, [orders[i]])
  }
  return [...groups.values()]
}

// Sequencia os pedidos por vizinho mais próximo (nearest neighbor), partindo de
// `start` (a loja): a cada passo, escolhe entre os restantes o mais próximo do
// último ponto visitado. Aproxima uma rota curta sem ser ótima (TSP é NP-difícil),
// mas garante que o 1º pedido é o mais perto da loja e reduz zigue-zague.
//
// Pedidos sem lat/lng não entram no cálculo de distância — ficam ao final, na
// ordem em que já estavam (não há como saber a que distância estão).
export function orderByNearestNeighbor<T extends ClusterableOrder>(
  start: { lat: number; lng: number },
  orders: T[],
): T[] {
  const withCoords = orders.filter((o): o is T & { lat: number; lng: number } => o.lat != null && o.lng != null)
  const withoutCoords = orders.filter(o => o.lat == null || o.lng == null)

  const remaining = [...withCoords]
  const result: T[] = []
  let current = start

  while (remaining.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(current.lat, current.lng, remaining[i].lat, remaining[i].lng)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    const [next] = remaining.splice(bestIdx, 1)
    result.push(next)
    current = { lat: next.lat, lng: next.lng }
  }

  return [...result, ...withoutCoords]
}
