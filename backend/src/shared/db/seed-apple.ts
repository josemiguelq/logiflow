import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './client'
import { DEFAULT_ROLE_SCOPES } from '../scopes'

// Seed mínimo para a revisão da Apple: uma loja demo, um entregador de teste já
// pronto (sem onboarding) e alguns pedidos "Aguardando" para o revisor aceitar
// e percorrer o fluxo completo. Idempotente — pode rodar quantas vezes quiser.

const STORE_NAME = 'LogiFlow Demo'
const STORE_LAT  = -20.4697
const STORE_LNG  = -54.6201

// Credenciais que vão no App Store Connect (Beta App Review Information).
const DRIVER_USER = 'apple.review'
const DRIVER_PASS = 'Review1234'

function code(len = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

const customers = [
  { name: 'Fernanda Silva',  phone: '67990000001', address: 'Rua 14 de Julho, 1234 — Centro',         lat: -20.4723, lng: -54.6158 },
  { name: 'Roberto Souza',   phone: '67990000002', address: 'Av. Mato Grosso, 456 — Jd. dos Estados', lat: -20.4851, lng: -54.6132 },
  { name: 'Camila Oliveira', phone: '67990000003', address: 'Rua Joaquim Murtinho, 789 — Amambai',    lat: -20.4780, lng: -54.6340 },
  { name: 'Lucas Pereira',   phone: '67990000004', address: 'Av. Costa e Silva, 321 — Monte Castelo', lat: -20.4612, lng: -54.6387 },
  { name: 'Beatriz Costa',   phone: '67990000005', address: 'Rua das Garças, 88 — Chácara Cachoeira', lat: -20.4755, lng: -54.5952 },
  { name: 'Marcos Lima',     phone: '67990000006', address: 'Av. Euler de Azevedo, 550 — Coophavila', lat: -20.5010, lng: -54.6290 },
  { name: 'Juliana Rocha',   phone: '67990000007', address: 'Rua Onça Pintada, 22 — Carandá Bosque',  lat: -20.4530, lng: -54.6480 },
  { name: 'André Martins',   phone: '67990000008', address: 'Rua Ceará, 340 — Amambaí',               lat: -20.4802, lng: -54.6276 },
]

async function seed() {
  console.log('[seed-apple] iniciando...')

  await db.transaction(async (client) => {
    // ── Loja demo ─────────────────────────────────────────────────────────────
    const { rows: [store] } = await client.query(
      `INSERT INTO stores (name, lat, lng)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM stores WHERE name = $1)
       RETURNING id`,
      [STORE_NAME, STORE_LAT, STORE_LNG]
    )
    const storeId: string =
      store?.id ?? (await client.query(`SELECT id FROM stores WHERE name = $1`, [STORE_NAME])).rows[0].id

    // Todas as features habilitadas
    await client.query(`
      INSERT INTO store_features_enabled (store_id, feature_id)
      SELECT $1, id FROM features ON CONFLICT DO NOTHING
    `, [storeId])

    // Settings: sem códigos (revisor não tem como saber o código de retirada da
    // rota); foto de entrega ligada para demonstrar o comprovante.
    const settings: Record<string, string> = {
      require_pickup_code:    'false',
      require_delivery_code:  'false',
      require_delivery_photo: 'true',
      max_orders_per_route:   '5',
      allow_customer_ratings: 'true',
    }
    for (const [name, value] of Object.entries(settings)) {
      await client.query(`
        INSERT INTO store_setting_values (store_id, setting_id, value)
        SELECT $1, id, $2 FROM settings WHERE name = $3
        ON CONFLICT (store_id, setting_id) DO UPDATE SET value = EXCLUDED.value
      `, [storeId, value, name])
    }

    // Escopos de papel + um usuário OWNER (necessário para criar pedidos)
    for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
      await client.query(`
        INSERT INTO store_role_scopes (store_id, role, scopes)
        VALUES ($1, $2, $3) ON CONFLICT (store_id, role) DO NOTHING
      `, [storeId, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])])
    }
    const ownerHash = await bcrypt.hash('demo123', 10)
    const { rows: [owner] } = await client.query(`
      INSERT INTO store_users (store_id, name, email, username, password_hash, role)
      VALUES ($1, 'Demo Owner', 'owner@logiflow-demo.com', 'demo.owner', $2, 'OWNER')
      ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
      RETURNING id
    `, [storeId, ownerHash])
    const ownerId: string = owner.id

    // ── Entregador de teste (já pronto, sem onboarding) ─────────────────────────
    const driverHash = await bcrypt.hash(DRIVER_PASS, 10)
    const { rows: [driver] } = await client.query(`
      INSERT INTO deliverers (store_id, name, username, password_hash, status, needs_onboarding)
      VALUES ($1, 'Apple Review', $2, $3, 'AVAILABLE', false)
      ON CONFLICT (username) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, needs_onboarding = false, status = 'AVAILABLE'
      RETURNING id
    `, [storeId, DRIVER_USER, driverHash])
    const driverId: string = driver.id

    // ── Clientes + endereço padrão ──────────────────────────────────────────────
    const customerIds: string[] = []
    for (const c of customers) {
      const { rows: [row] } = await client.query(`
        INSERT INTO customers (store_id, name, phone) VALUES ($1, $2, $3)
        ON CONFLICT (store_id, phone) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [storeId, c.name, c.phone])
      const customerId = row.id as string
      customerIds.push(customerId)

      await client.query(`DELETE FROM customer_addresses WHERE customer_id = $1`, [customerId])
      await client.query(`
        INSERT INTO customer_addresses (customer_id, store_id, label, address, lat, lng, is_default)
        VALUES ($1, $2, 'Principal', $3, $4, $5, true)
      `, [customerId, storeId, c.address, c.lat, c.lng])
    }

    // ── Pedidos "Aguardando" (PREPARING, sem entregador) ────────────────────────
    // Limpa os pendentes antigos da loja demo e recria, para não acumular.
    await client.query(
      `DELETE FROM orders WHERE store_id = $1 AND status = 'PREPARING' AND deliverer_id IS NULL`,
      [storeId]
    )
    for (let i = 0; i < customers.length; i++) {
      const c = customers[i]!
      await client.query(`
        INSERT INTO orders
          (store_id, customer_id, created_by_user_id, status, pickup_code, delivery_code,
           lat, lng, delivery_address, delivery_lat, delivery_lng)
        VALUES ($1, $2, $3, 'PREPARING', $4, $5, $6, $7, $8, $9, $10)
      `, [storeId, customerIds[i], ownerId, code(), c.phone.slice(-4),
          STORE_LAT, STORE_LNG, c.address, c.lat, c.lng])
    }

    console.log(`[seed-apple] loja ${storeId} — ${customers.length} pedidos aguardando`)
  })

  console.log('\n[seed-apple] concluído ✓')
  console.log('─────────────────────────────────────────────')
  console.log(`  App do Entregador (iOS)`)
  console.log(`  usuário: ${DRIVER_USER}`)
  console.log(`  senha:   ${DRIVER_PASS}`)
  console.log('─────────────────────────────────────────────\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed-apple] erro:', err)
  process.exit(1)
})
