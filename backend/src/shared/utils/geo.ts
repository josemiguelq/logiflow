// Distância em metros entre dois pontos (lat/lng) — fórmula de Haversine.
export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000 // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Distância (m) acima da qual consideramos a entrega "fora do local esperado".
export const OFF_TARGET_THRESHOLD_M = 100

// Houve entrega fora do local? Compara o ponto esperado (endereço/override) com
// o ponto real do comprovante. Retorna false se faltar qualquer coordenada.
export function isDeliveredOffTarget(
  targetLat?: number | null, targetLng?: number | null,
  actualLat?: number | null, actualLng?: number | null,
): boolean {
  if (targetLat == null || targetLng == null || actualLat == null || actualLng == null) return false
  return haversineMeters(targetLat, targetLng, actualLat, actualLng) > OFF_TARGET_THRESHOLD_M
}
