// Resolve cidade/UF/CEP de um endereço via Geocoding API do Google.
//
// Esses campos NÃO são persistidos em customer_addresses (a tabela guarda apenas
// label/address/number/complement/lat/lng). Como a etiqueta precisa do endereço
// completo, a consulta é feita sob demanda, no momento da impressão, e o
// resultado fica em cache de memória para não repetir a chamada na mesma sessão.

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ''

export interface AddressDetails {
  city?: string
  state?: string
  postalCode?: string
}

interface GeocodeComponent {
  long_name:  string
  short_name: string
  types:      string[]
}

interface GeocodeResult {
  address_components: GeocodeComponent[]
}

const cache = new Map<string, AddressDetails>()

function pick(results: GeocodeResult[], types: string[], short = false): string | undefined {
  for (const r of results) {
    for (const c of r.address_components) {
      if (types.some(t => c.types.includes(t))) return short ? c.short_name : c.long_name
    }
  }
  return undefined
}

async function query(params: string): Promise<AddressDetails | null> {
  try {
    const res  = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}&language=pt-BR&key=${GMAPS_KEY}`)
    const data = await res.json()
    if (data.status !== 'OK' || !data.results?.length) return null
    const results = data.results as GeocodeResult[]
    return {
      // No Brasil a cidade vem como `locality`; em municípios sem locality o
      // fallback é `administrative_area_level_2`.
      city:       pick(results, ['locality', 'administrative_area_level_2']),
      state:      pick(results, ['administrative_area_level_1'], true),
      postalCode: pick(results, ['postal_code']),
    }
  } catch {
    return null
  }
}

/**
 * Descobre cidade, UF e CEP de um endereço. Usa as coordenadas quando existirem
 * (mais preciso) e cai para a busca textual quando o endereço não foi geocodado.
 * Retorna `{}` quando não há chave da API ou a consulta falha — a etiqueta ainda
 * é impressa, só sem a linha de cidade/CEP.
 */
export async function lookupAddressDetails(addr: {
  address: string
  number?: string
  lat?: number
  lng?: number
}): Promise<AddressDetails> {
  if (!GMAPS_KEY) return {}

  const hasCoords = addr.lat != null && addr.lng != null
  const text      = addr.number ? `${addr.address}, ${addr.number}` : addr.address
  const key       = hasCoords ? `${addr.lat},${addr.lng}` : `t:${text}`

  const cached = cache.get(key)
  if (cached) return cached

  const details =
    (hasCoords ? await query(`latlng=${addr.lat},${addr.lng}`) : null) ??
    (text.length >= 4 ? await query(`address=${encodeURIComponent(text)}&region=br`) : null) ??
    {}

  cache.set(key, details)
  return details
}
