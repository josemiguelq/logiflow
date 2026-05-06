/**
 * Simula o app do entregador.
 *
 * Uso (posicional — com npm run):
 *   npm run simulate -- <orderId> [usuario] [senha] [steps] [delayMs]
 *
 * Uso com flags (npx tsx diretamente):
 *   npx tsx scripts/simulate-deliverer.ts --order <id> --user carlos.moto --pass carlos123
 */

import 'dotenv/config'

// ── Args — suporta posicional E flags ────────────────────────────────────────
const raw = process.argv.slice(2)

const flag = (name: string): string | undefined => {
  const i = raw.indexOf(name)
  return i !== -1 ? raw[i + 1] : undefined
}

// Posicionais: args que não começam com - e não são valor de uma flag
const positional = raw.filter((a, i) =>
  !a.startsWith('-') && (i === 0 || !raw[i - 1].startsWith('-'))
)

const ORDER_ID = flag('--order') ?? positional[0]
const USERNAME = flag('--user')  ?? positional[1] ?? 'carlos.moto'
const PASSWORD = flag('--pass')  ?? positional[2] ?? 'carlos123'
const STEPS    = Number(flag('--steps') ?? positional[3] ?? '12')
const DELAY_MS = Number(flag('--delay') ?? positional[4] ?? '3000')
const BASE_URL = flag('--api')   ?? process.env.API_URL ?? 'http://localhost:3001'

if (!ORDER_ID) {
  console.error('\nUso:')
  console.error('  npm run simulate -- <orderId> [usuario] [senha] [steps] [delayMs]')
  console.error('\nExemplo:')
  console.error('  npm run simulate -- 5ba7741f-f6de-4a6b-8fc3-9884471c2a2f carlos.moto carlos123 16 2000\n')
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function noise() {
  return (Math.random() - 0.5) * 0.0004
}

function interpolate(
  fromLat: number, fromLng: number,
  toLat:   number, toLng:   number,
  steps:   number
): { lat: number; lng: number }[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return {
      lat: fromLat + (toLat - fromLat) * t + noise(),
      lng: fromLng + (toLng - fromLng) * t + noise(),
    }
  })
}

let TOKEN = ''

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body as T
}

// ── Ponto de coleta (loja) — Campo Grande Centro ──────────────────────────────
const STORE_LAT = -20.4697
const STORE_LNG = -54.6201

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n  LogiFlow — Simulacao de Entregador')
  console.log('─────────────────────────────────────')
  console.log(`Pedido:     ${ORDER_ID}`)
  console.log(`Entregador: ${USERNAME}`)
  console.log(`Passos GPS: ${STEPS}`)
  console.log(`Intervalo:  ${DELAY_MS}ms\n`)

  // 1. Login
  process.stdout.write('[ 1/6 ] Login... ')
  const auth = await req<{ token: string; deliverer: { id: string; name: string; storeId: string } }>(
    '/auth/deliverer/login',
    { method: 'POST', body: JSON.stringify({ username: USERNAME, password: PASSWORD }) }
  )
  TOKEN = auth.token
  console.log(`OK — Ola, ${auth.deliverer.name}!`)

  // 2. Busca pedidos ativos do entregador
  process.stdout.write('[ 2/6 ] Buscando pedido... ')
  const orders = await req<Array<{
    id: string
    status: string
    pickupCode: string
    deliveryCode: string
    customer: { name: string; address: string; lat?: number; lng?: number }
  }>>('/deliverer/orders')

  const order = orders.find((o) => o.id === ORDER_ID)
  if (!order) {
    console.error(`\nERRO: Pedido ${ORDER_ID} nao encontrado nos pedidos ativos deste entregador.`)
    process.exit(1)
  }

  console.log(`OK — ${order.customer.name} (${order.customer.address})`)
  console.log(`   Status: ${order.status}`)

  const destLat = order.customer.lat ?? (STORE_LAT + (Math.random() - 0.5) * 0.03)
  const destLng = order.customer.lng ?? (STORE_LNG + (Math.random() - 0.5) * 0.03)

  // 3. Confirmar coleta
  if (order.status === 'ASSIGNED') {
    process.stdout.write(`[ 3/6 ] Confirmando coleta (codigo: ${order.pickupCode})... `)
    await req(`/deliverer/orders/${ORDER_ID}/pickup`, {
      method: 'POST',
      body:   JSON.stringify({ code: order.pickupCode }),
    })
    console.log('OK')
    await sleep(1000)
  } else {
    console.log('[ 3/6 ] Coleta ja confirmada — pulando.')
  }

  // 4. GPS — primeira metade da rota
  console.log(`\n[ 4/6 ] Simulando GPS ate ${order.customer.name}...`)
  const route    = interpolate(STORE_LAT, STORE_LNG, destLat, destLng, STEPS)
  const midpoint = Math.floor(STEPS / 2)

  for (let i = 0; i < midpoint; i++) {
    const { lat, lng } = route[i]
    await req('/tracking/location', {
      method: 'POST',
      body:   JSON.stringify({ lat, lng }),
    })
    const bar = '#'.repeat(i + 1) + '.'.repeat(midpoint - i - 1)
    process.stdout.write(`\r   [${bar}] ${lat.toFixed(5)}, ${lng.toFixed(5)}   `)
    await sleep(DELAY_MS)
  }
  console.log()

  // 5. Iniciar entrega (ON_ROUTE → OUT_FOR_DELIVERY)
  process.stdout.write('[ 5/6 ] Saindo para entrega (start-route)... ')
  await req(`/deliverer/orders/${ORDER_ID}/start-route`, { method: 'PATCH' })
  console.log('OK')
  await sleep(1000)

  // GPS — segunda metade
  for (let i = midpoint; i < STEPS; i++) {
    const { lat, lng } = route[i]
    await req('/tracking/location', {
      method: 'POST',
      body:   JSON.stringify({ lat, lng }),
    })
    const done  = i - midpoint + 1
    const total = STEPS - midpoint
    const bar   = '#'.repeat(done) + '.'.repeat(total - done)
    process.stdout.write(`\r   [${bar}] ${lat.toFixed(5)}, ${lng.toFixed(5)}   `)
    await sleep(DELAY_MS)
  }
  console.log()

  // 6. Confirmar entrega
  process.stdout.write(`[ 6/6 ] Confirmando entrega (codigo: ${order.deliveryCode})... `)
  await req(`/deliverer/orders/${ORDER_ID}/deliver`, {
    method: 'POST',
    body:   JSON.stringify({
      code:     order.deliveryCode,
      lat:      destLat + noise(),
      lng:      destLng + noise(),
      photoUrl: `https://picsum.photos/seed/${ORDER_ID}/600/400`,
    }),
  })
  console.log('OK')

  console.log('\n─────────────────────────────────────')
  console.log('Simulacao concluida com sucesso!\n')
}

main().catch((err) => {
  console.error('\nErro:', err.message)
  process.exit(1)
})
