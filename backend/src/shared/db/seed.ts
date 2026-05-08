import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PoolClient } from 'pg'
import { db } from './client'
import { DEFAULT_ROLE_SCOPES } from '../scopes'

function route(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number,
  steps: number
): { lat: number; lng: number }[] {
  return Array.from({ length: steps }, (_, i) => {
    const t     = i / (steps - 1)
    const noise = () => (Math.random() - 0.5) * 0.0005
    return {
      lat: fromLat + (toLat - fromLat) * t + noise(),
      lng: fromLng + (toLng - fromLng) * t + noise(),
    }
  })
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000)
}

function code(s: string) { return s.toUpperCase().padEnd(5, '0').slice(0, 5) }

async function enableAllFeatures(client: PoolClient, storeId: string) {
  await client.query(`
    INSERT INTO store_features_enabled (store_id, feature_id)
    SELECT $1, id FROM features
    ON CONFLICT DO NOTHING
  `, [storeId])
}

async function seed() {
  console.log('[seed] iniciando...')

  await db.transaction(async (client) => {
    // ── Super Admin ───────────────────────────────────────────────────────────
    const saHash = await bcrypt.hash('superadmin123', 10)
    await client.query(`
      INSERT INTO super_admins (email, password_hash)
      VALUES ('superadmin@logiflow.com', $1)
      ON CONFLICT (email) DO NOTHING
    `, [saHash])
    console.log('[seed] superadmin: superadmin@logiflow.com / superadmin123')

    // ── Store 1: LogiFlow Demo ────────────────────────────────────────────────
    const { rows: existing1 } = await client.query(
      `SELECT id FROM stores WHERE name = $1`, ['LogiFlow Demo']
    )
    let storeId: string
    const isNewStore = !existing1[0]

    if (isNewStore) {
      const { rows: [s] } = await client.query(
        `INSERT INTO stores (name, lat, lng) VALUES ($1, $2, $3) RETURNING id`,
        ['LogiFlow Demo', -20.4697, -54.6201]
      )
      storeId = s.id
      console.log(`[seed] loja criada: ${storeId}`)
    } else {
      storeId = existing1[0].id
      console.log(`[seed] loja já existe: ${storeId}`)
    }

    // Always enable all features (idempotent)
    await enableAllFeatures(client, storeId)

    if (!isNewStore) {
      console.log('[seed] loja já existia, pulando dados demo...')
    } else {
      // ── Configurações ──────────────────────────────────────────────────────
      await client.query(`
        INSERT INTO store_settings (store_id, max_orders_per_route, require_delivery_photo)
        VALUES ($1, 5, true)
      `, [storeId])

      // ── Role scopes ────────────────────────────────────────────────────────
      for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
        await client.query(`
          INSERT INTO store_role_scopes (store_id, role, scopes)
          VALUES ($1, $2, $3)
          ON CONFLICT (store_id, role) DO NOTHING
        `, [storeId, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])])
      }

      // ── Usuários ───────────────────────────────────────────────────────────
      const users = [
        { name: 'Admin Owner',    email: 'admin@logiflow.com',    username: 'admin',    password: 'admin123',    role: 'OWNER'     },
        { name: 'Maria Gerente',  email: 'gerente@logiflow.com',  username: 'gerente',  password: 'gerente123',  role: 'MANAGER'   },
        { name: 'João Atendente', email: 'joao@logiflow.com',     username: 'joao',     password: 'joao123',     role: 'ASSISTANT' },
      ]

      const userIds: string[] = []
      for (const u of users) {
        const hash = await bcrypt.hash(u.password, 10)
        const { rows: [row] } = await client.query(`
          INSERT INTO store_users (store_id, name, email, username, password_hash, role)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
        `, [storeId, u.name, u.email, u.username, hash, u.role])
        userIds.push(row.id)
        console.log(`[seed] usuário: ${u.email} (${u.role}) senha: ${u.password}`)
      }
      const ownerId = userIds[0]!

      // ── Entregadores ───────────────────────────────────────────────────────
      const deliverers = [
        { name: 'Carlos Moto',   username: 'carlos.moto', password: 'carlos123' },
        { name: 'Ana Bicicleta', username: 'ana.bike',    password: 'ana123'    },
        { name: 'Pedro Van',     username: 'pedro.van',   password: 'pedro123'  },
      ]

      const delivererIds: string[] = []
      for (const d of deliverers) {
        const hash = await bcrypt.hash(d.password, 10)
        const { rows: [row] } = await client.query(`
          INSERT INTO deliverers (store_id, name, username, password_hash, status, needs_onboarding)
          VALUES ($1,$2,$3,$4,'AVAILABLE', false) RETURNING id
        `, [storeId, d.name, d.username, hash])
        delivererIds.push(row.id)
        console.log(`[seed] entregador: @${d.username} senha: ${d.password}`)
      }

      // ── Clientes em Campo Grande MS ────────────────────────────────────────
      const storeLat = -20.4697
      const storeLng = -54.6201

      const customers = [
        { name: 'Fernanda Silva',   phone: '67999990001', address: 'Rua 14 de Julho, 1234 — Centro',         lat: -20.4723, lng: -54.6158 },
        { name: 'Roberto Souza',    phone: '67999990002', address: 'Av. Mato Grosso, 456 — Jd. dos Estados', lat: -20.4851, lng: -54.6132 },
        { name: 'Camila Oliveira',  phone: '67999990003', address: 'Rua Joaquim Murtinho, 789 — Amambai',    lat: -20.4780, lng: -54.6340 },
        { name: 'Lucas Pereira',    phone: '67999990004', address: 'Av. Costa e Silva, 321 — Monte Castelo', lat: -20.4612, lng: -54.6387 },
        { name: 'Beatriz Costa',    phone: '67999990005', address: 'Rua das Garças, 88 — Chácara Cachoeira', lat: -20.4755, lng: -54.5952 },
        { name: 'Marcos Lima',      phone: '67999990006', address: 'Av. Euler de Azevedo, 550 — Coophavila', lat: -20.5010, lng: -54.6290 },
        { name: 'Juliana Rocha',    phone: '67999990007', address: 'Rua Onça Pintada, 22 — Carandá Bosque',  lat: -20.4530, lng: -54.6480 },
        { name: 'André Martins',    phone: '67999990008', address: 'Rua Ceará, 340 — Amambaí',               lat: -20.4802, lng: -54.6276 },
        { name: 'Patrícia Alves',   phone: '67999990009', address: 'Av. Bandeirantes, 980 — Taveirópolis',   lat: -20.5123, lng: -54.6440 },
        { name: 'Ricardo Nunes',    phone: '67999990010', address: 'Rua Bahia, 112 — São Francisco',         lat: -20.4663, lng: -54.6087 },
        { name: 'Joel',             phone: '19971700940', address: 'Rua Coxim, 67 — Tiradentes',             lat: -20.4591, lng: -54.6318 },
        { name: 'Diego Carvalho',   phone: '67999990012', address: 'Av. Três Barras, 455 — Nova Lima',       lat: -20.4930, lng: -54.6165 },
      ]

      const customerIds: string[] = []
      for (const c of customers) {
        const { rows: [row] } = await client.query(`
          INSERT INTO customers (store_id, name, phone, address, lat, lng)
          VALUES ($1,$2,$3,$4,$5,$6) RETURNING id
        `, [storeId, c.name, c.phone, c.address, c.lat, c.lng])
        customerIds.push(row.id)
        console.log(`[seed] cliente: ${c.name}`)
      }

      // Rota em andamento: Ana
      const activeStartedAt = minutesAgo(55)
      await client.query(`
        INSERT INTO routes (store_id, deliverer_id, pickup_code, status, started_at)
        VALUES ($1,$2,$3,'STARTED',$4)
        RETURNING id
      `, [storeId, delivererIds[1], code('RA001'), activeStartedAt])

      const activePoints = [
        ...route(storeLat, storeLng, customers[3]!.lat, customers[3]!.lng, 7),
        ...route(customers[3]!.lat, customers[3]!.lng, customers[4]!.lat, customers[4]!.lng, 7),
      ]
      for (let i = 0; i < activePoints.length; i++) {
        const p = activePoints[i]!
        await client.query(
          'INSERT INTO location_history (deliverer_id, lat, lng, recorded_at) VALUES ($1,$2,$3,$4)',
          [delivererIds[1], p.lat, p.lng, new Date(activeStartedAt.getTime() + i * 75_000)]
        )
      }

      // 7 pedidos PREPARING
      console.log('\n[seed] criando 7 pedidos PREPARING...')
      const preparingOrders = [
        { customerIdx: 5,  pickupCode: 'PP001', deliveryCode: '0067' },
        { customerIdx: 6,  pickupCode: 'PP002', deliveryCode: '0067' },
        { customerIdx: 7,  pickupCode: 'PP003', deliveryCode: '0067' },
        { customerIdx: 8,  pickupCode: 'PP004', deliveryCode: '0067' },
        { customerIdx: 9,  pickupCode: 'PP005', deliveryCode: '0067' },
        { customerIdx: 10, pickupCode: 'PP006', deliveryCode: '0067' },
        { customerIdx: 11, pickupCode: 'PP007', deliveryCode: '0067' },
      ]
      for (const o of preparingOrders) {
        await client.query(`
          INSERT INTO orders (store_id, customer_id, created_by_user_id, status, pickup_code, delivery_code, lat, lng)
          VALUES ($1,$2,$3,'PREPARING',$4,$5,$6,$7)
        `, [storeId, customerIds[o.customerIdx]!, ownerId, o.pickupCode, o.deliveryCode, storeLat, storeLng])
      }
    }

    // ── Store 2: LogiFlow Beta ────────────────────────────────────────────────
    console.log('\n[seed] criando/verificando loja 2...')
    const { rows: existing2 } = await client.query(
      `SELECT id FROM stores WHERE name = $1`, ['LogiFlow Beta']
    )

    let store2Id: string
    const isNewStore2 = !existing2[0]

    if (isNewStore2) {
      const { rows: [s2] } = await client.query(
        `INSERT INTO stores (name, lat, lng) VALUES ($1, $2, $3) RETURNING id`,
        ['LogiFlow Beta', -23.5505, -46.6333]
      )
      store2Id = s2.id
      console.log(`[seed] loja 2 criada: ${store2Id}`)
    } else {
      store2Id = existing2[0].id
      console.log(`[seed] loja 2 já existe: ${store2Id}`)
    }

    // Always enable all features (idempotent)
    await enableAllFeatures(client, store2Id)

    if (isNewStore2) {
      // Settings
      await client.query(`
        INSERT INTO store_settings (store_id, max_orders_per_route, require_delivery_photo)
        VALUES ($1, 8, false)
      `, [store2Id])

      // Role scopes
      for (const role of ['OWNER', 'MANAGER', 'ASSISTANT'] as const) {
        await client.query(`
          INSERT INTO store_role_scopes (store_id, role, scopes)
          VALUES ($1, $2, $3)
          ON CONFLICT (store_id, role) DO NOTHING
        `, [store2Id, role, JSON.stringify(DEFAULT_ROLE_SCOPES[role])])
      }

      // Owner
      const hash2 = await bcrypt.hash('beta123', 10)
      await client.query(`
        INSERT INTO store_users (store_id, name, email, username, password_hash, role)
        VALUES ($1, 'Beta Owner', 'owner@beta.com', 'beta.owner', $2, 'OWNER')
      `, [store2Id, hash2])
      console.log('[seed] usuário loja 2: owner@beta.com / beta123')
    }
  })

  console.log('\n[seed] concluído! ✓\n')
  console.log('─────────────────────────────────────────────────')
  console.log('  Super Admin: http://localhost:3000/super-admin')
  console.log('  superadmin@logiflow.com  /  superadmin123')
  console.log('─────────────────────────────────────────────────')
  console.log('  Loja 1 — LogiFlow Demo')
  console.log('  admin@logiflow.com  /  admin123')
  console.log('  gerente@logiflow.com  /  gerente123')
  console.log('─────────────────────────────────────────────────')
  console.log('  Loja 2 — LogiFlow Beta')
  console.log('  owner@beta.com  /  beta123')
  console.log('─────────────────────────────────────────────────')
  console.log('  App entregador:')
  console.log('  carlos.moto  /  carlos123')
  console.log('  ana.bike     /  ana123     (rota ativa)')
  console.log('  pedro.van    /  pedro123')
  console.log('─────────────────────────────────────────────────\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] erro:', err)
  process.exit(1)
})
