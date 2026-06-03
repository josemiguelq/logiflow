/**
 * Corrige as coordenadas de endereços de clientes usando a Geocoding API do Google.
 *
 * Uso:
 *   npm run fix-coords
 *
 * Preencha CUSTOMER_IDS abaixo antes de rodar.
 * Exige DATABASE_URL e GOOGLE_MAPS_API_KEY no .env
 */
import 'dotenv/config'
import { Pool } from 'pg'

// ── PREENCHA AQUI ─────────────────────────────────────────────────────────────
const CUSTOMER_IDS: string[] = [
  // 'uuid-1',
  // 'uuid-2',
]
// ─────────────────────────────────────────────────────────────────────────────

const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY ?? ''
const DELAY_MS  = 200   // evita rate-limit da Geocoding API

if (!GMAPS_KEY) {
  console.error('GOOGLE_MAPS_API_KEY não configurada no .env')
  process.exit(1)
}
if (CUSTOMER_IDS.length === 0) {
  console.error('Adicione os customer IDs em CUSTOMER_IDS antes de rodar o script.')
  process.exit(1)
}

const dbUrl   = process.env.DATABASE_URL ?? ''
const needsSsl = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')
const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
})

async function geocode(fullAddress: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&region=br&language=pt-BR&key=${GMAPS_KEY}`
  const res  = await fetch(url)
  const data = await res.json() as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  if (data.status !== 'OK' || !data.results[0]) return null
  return data.results[0].geometry.location
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function run() {
  const client = await pool.connect()
  try {
    const { rows: addresses } = await client.query<{
      id: string
      customer_id: string
      address: string
      number: string | null
      lat: number | null
      lng: number | null
    }>(
      `SELECT id, customer_id, address, number, lat, lng
       FROM customer_addresses
       WHERE customer_id = ANY($1::uuid[])
       ORDER BY customer_id, is_default DESC`,
      [CUSTOMER_IDS]
    )

    console.log(`\nEncontrados ${addresses.length} endereço(s) para ${CUSTOMER_IDS.length} cliente(s).\n`)

    let updated = 0
    let failed  = 0

    for (const row of addresses) {
      const fullAddress = row.number
        ? `${row.address}, ${row.number}`
        : row.address

      process.stdout.write(`  [${row.id.slice(-8)}] "${fullAddress}" ... `)

      const coords = await geocode(fullAddress)

      if (!coords) {
        console.log('❌ não encontrado')
        failed++
      } else {
        const moved = row.lat != null && row.lng != null
          ? distanceMeters(row.lat, row.lng, coords.lat, coords.lng)
          : null

        await client.query(
          `UPDATE customer_addresses SET lat = $1, lng = $2 WHERE id = $3`,
          [coords.lat, coords.lng, row.id]
        )

        const delta = moved != null ? ` (Δ ${Math.round(moved)}m)` : ' (sem coords anteriores)'
        console.log(`✅ ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}${delta}`)
        updated++
      }

      await sleep(DELAY_MS)
    }

    console.log(`\nConcluído: ${updated} atualizado(s), ${failed} falhou.\n`)
  } finally {
    client.release()
    await pool.end()
  }
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
