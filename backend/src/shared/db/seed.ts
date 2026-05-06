import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './client'

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

async function seed() {
  console.log('[seed] iniciando...')

  await db.transaction(async (client) => {
    // ── Loja ─────────────────────────────────────────────────────────────────
    const { rows: [store] } = await client.query(`
      INSERT INTO stores (name, lat, lng)
      VALUES ('LogiFlow Demo', -20.4697, -54.6201)
      ON CONFLICT DO NOTHING
      RETURNING id
    `)

    if (!store) {
      console.log('[seed] loja já existe, pulando...')
      return
    }

    const storeId = store.id
    console.log(`[seed] loja criada: ${storeId}`)

    // ── Configurações ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO store_settings (store_id, max_orders_per_route, require_delivery_photo)
      VALUES ($1, 5, true)
    `, [storeId])

    await client.query(`
      INSERT INTO store_features (store_id, custom_theme_enabled)
      VALUES ($1, false)
    `, [storeId])

    // ── Usuários ──────────────────────────────────────────────────────────────
    const users = [
      { name: 'Admin Owner',    email: 'admin@logiflow.com',    password: 'admin123',    role: 'OWNER'     },
      { name: 'Maria Gerente',  email: 'gerente@logiflow.com',  password: 'gerente123',  role: 'MANAGER'   },
      { name: 'João Atendente', email: 'joao@logiflow.com',     password: 'joao123',     role: 'ASSISTANT' },
    ]

    const userIds: string[] = []
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10)
      const { rows: [row] } = await client.query(`
        INSERT INTO store_users (store_id, name, email, password_hash, role)
        VALUES ($1,$2,$3,$4,$5) RETURNING id
      `, [storeId, u.name, u.email, hash, u.role])
      userIds.push(row.id)
      console.log(`[seed] usuário: ${u.email} (${u.role}) senha: ${u.password}`)
    }
    const ownerId = userIds[0]!

    // ── Entregadores ──────────────────────────────────────────────────────────
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

    // ── Clientes em Campo Grande MS ───────────────────────────────────────────
    // Loja: Av. Afonso Pena, Centro — -20.4697, -54.6201
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
      { name: 'Larissa Ferreira', phone: '67999990011', address: 'Rua Coxim, 67 — Tiradentes',             lat: -20.4591, lng: -54.6318 },
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

    const storeLat = -20.4697
    const storeLng = -54.6201

    // ── Entregas finalizadas ───────────────────────────────────────────────────
    console.log('\n[seed] criando entregas finalizadas...')

    const deliveredGroups = [
      {
        delivererId: delivererIds[0]!,
        deliveries: [
          { customerId: customerIds[0]!, pickupCode: 'A1B2C', deliveryCode: 'X9Y8Z', createdAt: minutesAgo(120), pickedUpAt: minutesAgo(105), deliveredAt: minutesAgo(88),  lat: customers[0]!.lat, lng: customers[0]!.lng },
          { customerId: customerIds[1]!, pickupCode: 'D3E4F', deliveryCode: 'W7V6U', createdAt: minutesAgo(120), pickedUpAt: minutesAgo(105), deliveredAt: minutesAgo(70),  lat: customers[1]!.lat, lng: customers[1]!.lng },
        ],
        routePoints: [
          ...route(storeLat, storeLng, customers[0]!.lat, customers[0]!.lng, 8),
          ...route(customers[0]!.lat, customers[0]!.lng, customers[1]!.lat, customers[1]!.lng, 7),
        ],
        startedAt: minutesAgo(105),
      },
      {
        delivererId: delivererIds[1]!,
        deliveries: [
          { customerId: customerIds[2]!, pickupCode: 'G5H6I', deliveryCode: 'T5S4R', createdAt: minutesAgo(200), pickedUpAt: minutesAgo(185), deliveredAt: minutesAgo(162), lat: customers[2]!.lat, lng: customers[2]!.lng },
          { customerId: customerIds[3]!, pickupCode: 'J7K8L', deliveryCode: 'Q3P2O', createdAt: minutesAgo(200), pickedUpAt: minutesAgo(185), deliveredAt: minutesAgo(140), lat: customers[3]!.lat, lng: customers[3]!.lng },
        ],
        routePoints: [
          ...route(storeLat, storeLng, customers[2]!.lat, customers[2]!.lng, 9),
          ...route(customers[2]!.lat, customers[2]!.lng, customers[3]!.lat, customers[3]!.lng, 8),
        ],
        startedAt: minutesAgo(185),
      },
      {
        delivererId: delivererIds[2]!,
        deliveries: [
          { customerId: customerIds[4]!, pickupCode: 'M9N0O', deliveryCode: 'N1M2L', createdAt: minutesAgo(300), pickedUpAt: minutesAgo(285), deliveredAt: minutesAgo(255), lat: customers[4]!.lat, lng: customers[4]!.lng },
        ],
        routePoints: route(storeLat, storeLng, customers[4]!.lat, customers[4]!.lng, 10),
        startedAt: minutesAgo(285),
      },
    ]

    for (const group of deliveredGroups) {
      for (let i = 0; i < group.deliveries.length; i++) {
        const d = group.deliveries[i]!
        const { rows: [order] } = await client.query(`
          INSERT INTO orders (
            store_id, deliverer_id, customer_id, created_by_user_id,
            status, route_position, pickup_code, delivery_code,
            lat, lng, created_at, picked_up_at, delivered_at
          ) VALUES ($1,$2,$3,$4,'DELIVERED',$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id
        `, [storeId, group.delivererId, d.customerId, ownerId, i + 1,
            d.pickupCode, d.deliveryCode, storeLat, storeLng,
            d.createdAt, d.pickedUpAt, d.deliveredAt])

        await client.query(`
          INSERT INTO proof_of_delivery (order_id, photo_url, lat, lng)
          VALUES ($1,$2,$3,$4)
        `, [order.id, `https://picsum.photos/seed/${order.id}/600/400`, d.lat, d.lng])

        console.log(`[seed] entregue: #${order.id.slice(-8).toUpperCase()}`)
      }

      const totalPoints  = group.routePoints.length
      const routeDuration = 105 * 60_000
      const startedMs    = group.startedAt.getTime()
      for (let i = 0; i < totalPoints; i++) {
        const { lat, lng } = group.routePoints[i]!
        const recordedAt  = new Date(startedMs + (i / totalPoints) * routeDuration)
        await client.query(
          'INSERT INTO location_history (deliverer_id, lat, lng, recorded_at) VALUES ($1,$2,$3,$4)',
          [group.delivererId, lat, lng, recordedAt]
        )
      }
    }

    // ── Pedidos PREPARING (prontos na loja, aguardando atribuição) ────────────
    console.log('\n[seed] criando pedidos PREPARING...')

    const preparingOrders = [
      { customerId: customerIds[5]!,  pickupCode: 'PP001', deliveryCode: 'PD001' },
      { customerId: customerIds[6]!,  pickupCode: 'PP002', deliveryCode: 'PD002' },
      { customerId: customerIds[7]!,  pickupCode: 'PP003', deliveryCode: 'PD003' },
      { customerId: customerIds[8]!,  pickupCode: 'PP004', deliveryCode: 'PD004' },
      { customerId: customerIds[9]!,  pickupCode: 'PP005', deliveryCode: 'PD005' },
      { customerId: customerIds[10]!, pickupCode: 'PP006', deliveryCode: 'PD006' },
    ]

    for (const o of preparingOrders) {
      await client.query(`
        INSERT INTO orders (store_id, customer_id, created_by_user_id, status, pickup_code, delivery_code, lat, lng)
        VALUES ($1,$2,$3,'PREPARING',$4,$5,$6,$7)
      `, [storeId, o.customerId, ownerId, o.pickupCode, o.deliveryCode, storeLat, storeLng])
      console.log(`[seed] PREPARING: código retirada ${o.pickupCode}`)
    }

    // ── Pedidos ASSIGNED (atribuídos, prontos para retirada no app) ───────────
    console.log('\n[seed] criando pedidos ASSIGNED...')

    // Carlos: 4 pedidos prontos para ele retirar
    const carlosAssigned = [
      { customerId: customerIds[0]!,  pickupCode: 'CA001', deliveryCode: 'CD001', pos: 1 },
      { customerId: customerIds[2]!,  pickupCode: 'CA002', deliveryCode: 'CD002', pos: 2 },
      { customerId: customerIds[5]!,  pickupCode: 'CA003', deliveryCode: 'CD003', pos: 3 },
      { customerId: customerIds[9]!,  pickupCode: 'CA004', deliveryCode: 'CD004', pos: 4 },
    ]

    for (const o of carlosAssigned) {
      await client.query(`
        INSERT INTO orders (store_id, deliverer_id, customer_id, created_by_user_id,
          status, route_position, pickup_code, delivery_code, lat, lng)
        VALUES ($1,$2,$3,$4,'ASSIGNED',$5,$6,$7,$8,$9)
      `, [storeId, delivererIds[0], o.customerId, ownerId,
          o.pos, o.pickupCode, o.deliveryCode, storeLat, storeLng])
      console.log(`[seed] ASSIGNED carlos pos=${o.pos}: ${o.pickupCode}`)
    }

    // Ana: 3 pedidos prontos para ela retirar
    const anaAssigned = [
      { customerId: customerIds[3]!,  pickupCode: 'AA001', deliveryCode: 'AD001', pos: 1 },
      { customerId: customerIds[7]!,  pickupCode: 'AA002', deliveryCode: 'AD002', pos: 2 },
      { customerId: customerIds[11]!, pickupCode: 'AA003', deliveryCode: 'AD003', pos: 3 },
    ]

    for (const o of anaAssigned) {
      await client.query(`
        INSERT INTO orders (store_id, deliverer_id, customer_id, created_by_user_id,
          status, route_position, pickup_code, delivery_code, lat, lng)
        VALUES ($1,$2,$3,$4,'ASSIGNED',$5,$6,$7,$8,$9)
      `, [storeId, delivererIds[1], o.customerId, ownerId,
          o.pos, o.pickupCode, o.deliveryCode, storeLat, storeLng])
      console.log(`[seed] ASSIGNED ana pos=${o.pos}: ${o.pickupCode}`)
    }
  })

  console.log('\n[seed] concluído! ✓\n')
  console.log('─────────────────────────────────────────────────')
  console.log('  Painel web:  http://localhost:3000/login')
  console.log('  admin@logiflow.com  /  admin123')
  console.log('─────────────────────────────────────────────────')
  console.log('  App entregador:')
  console.log('  carlos.moto  /  carlos123  (4 pedidos ASSIGNED)')
  console.log('  ana.bike     /  ana123     (3 pedidos ASSIGNED)')
  console.log('  pedro.van    /  pedro123   (sem pedidos)')
  console.log('─────────────────────────────────────────────────\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] erro:', err)
  process.exit(1)
})
