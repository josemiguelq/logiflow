import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { db } from './client'

// Interpola N pontos entre dois coords com leve ruído para simular GPS real
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

async function seed() {
  console.log('[seed] iniciando...')

  await db.transaction(async (client) => {
    // ── Loja ────────────────────────────────────────────────────────────────
    const { rows: [store] } = await client.query(`
      INSERT INTO stores (name)
      VALUES ('LogiFlow Demo')
      ON CONFLICT DO NOTHING
      RETURNING id
    `)

    if (!store) {
      console.log('[seed] loja já existe, pulando...')
      return
    }

    const storeId = store.id
    console.log(`[seed] loja criada: ${storeId}`)

    // ── Configurações ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO store_settings (store_id, max_orders_per_route, require_delivery_photo)
      VALUES ($1, 5, true)
    `, [storeId])

    // ── Usuários ─────────────────────────────────────────────────────────────
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
    const ownerId = userIds[0]

    // ── Entregadores ─────────────────────────────────────────────────────────
    const deliverers = [
      { name: 'Carlos Moto',    username: 'carlos.moto',  password: 'carlos123' },
      { name: 'Ana Bicicleta',  username: 'ana.bike',     password: 'ana123'    },
      { name: 'Pedro Van',      username: 'pedro.van',    password: 'pedro123'  },
    ]

    const delivererIds: string[] = []
    for (const d of deliverers) {
      const hash = await bcrypt.hash(d.password, 10)
      const { rows: [row] } = await client.query(`
        INSERT INTO deliverers (store_id, name, username, password_hash, status)
        VALUES ($1,$2,$3,$4,'AVAILABLE') RETURNING id
      `, [storeId, d.name, d.username, hash])
      delivererIds.push(row.id)
      console.log(`[seed] entregador: @${d.username} senha: ${d.password}`)
    }

    // ── Clientes em Campo Grande MS ──────────────────────────────────────────
    // Loja (ponto de coleta): Av. Afonso Pena, Centro — -20.4697, -54.6201
    const customers = [
      {
        name: 'Fernanda Silva',
        phone: '67999990001',
        address: 'Rua 14 de Julho, 1234 — Centro, Campo Grande MS',
        lat: -20.4723, lng: -54.6158,
      },
      {
        name: 'Roberto Souza',
        phone: '67999990002',
        address: 'Av. Mato Grosso, 456 — Jardim dos Estados, Campo Grande MS',
        lat: -20.4851, lng: -54.6132,
      },
      {
        name: 'Camila Oliveira',
        phone: '67999990003',
        address: 'Rua Joaquim Murtinho, 789 — Amambai, Campo Grande MS',
        lat: -20.4780, lng: -54.6340,
      },
      {
        name: 'Lucas Pereira',
        phone: '67999990004',
        address: 'Av. Costa e Silva, 321 — Monte Castelo, Campo Grande MS',
        lat: -20.4612, lng: -54.6387,
      },
      {
        name: 'Beatriz Costa',
        phone: '67999990005',
        address: 'Rua das Garças, 88 — Chácara Cachoeira, Campo Grande MS',
        lat: -20.4755, lng: -54.5952,
      },
      {
        name: 'Marcos Lima',
        phone: '67999990006',
        address: 'Av. Euler de Azevedo, 550 — Coophavila II, Campo Grande MS',
        lat: -20.5010, lng: -54.6290,
      },
      {
        name: 'Juliana Rocha',
        phone: '67999990007',
        address: 'Rua Onça Pintada, 22 — Carandá Bosque, Campo Grande MS',
        lat: -20.4530, lng: -54.6480,
      },
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

    // ── Ponto de coleta (loja) ───────────────────────────────────────────────
    const storeLat = -20.4697
    const storeLng = -54.6201

    // ── Entregas finalizadas com histórico de localização ────────────────────
    console.log('\n[seed] criando entregas finalizadas com histórico GPS...')

    const deliveredOrders = [
      {
        // Carlos entregou para Fernanda e Roberto (rota dupla)
        delivererId: delivererIds[0],
        deliveries: [
          {
            customerId: customerIds[0], // Fernanda — Centro
            pickupCode: 'A1B2C',
            deliveryCode: 'X9Y8Z',
            createdAt: minutesAgo(120),
            pickedUpAt: minutesAgo(105),
            deliveredAt: minutesAgo(88),
            lat: customers[0].lat,
            lng: customers[0].lng,
          },
          {
            customerId: customerIds[1], // Roberto — Jardim dos Estados
            pickupCode: 'D3E4F',
            deliveryCode: 'W7V6U',
            createdAt: minutesAgo(120),
            pickedUpAt: minutesAgo(105),
            deliveredAt: minutesAgo(70),
            lat: customers[1].lat,
            lng: customers[1].lng,
          },
        ],
        // Rota: loja → Fernanda → Roberto
        routePoints: [
          ...route(storeLat, storeLng, customers[0].lat, customers[0].lng, 8),
          ...route(customers[0].lat, customers[0].lng, customers[1].lat, customers[1].lng, 7),
        ],
        startedAt: minutesAgo(105),
      },
      {
        // Ana entregou para Camila e Lucas
        delivererId: delivererIds[1],
        deliveries: [
          {
            customerId: customerIds[2], // Camila — Amambai
            pickupCode: 'G5H6I',
            deliveryCode: 'T5S4R',
            createdAt: minutesAgo(200),
            pickedUpAt: minutesAgo(185),
            deliveredAt: minutesAgo(162),
            lat: customers[2].lat,
            lng: customers[2].lng,
          },
          {
            customerId: customerIds[3], // Lucas — Monte Castelo
            pickupCode: 'J7K8L',
            deliveryCode: 'Q3P2O',
            createdAt: minutesAgo(200),
            pickedUpAt: minutesAgo(185),
            deliveredAt: minutesAgo(140),
            lat: customers[3].lat,
            lng: customers[3].lng,
          },
        ],
        routePoints: [
          ...route(storeLat, storeLng, customers[2].lat, customers[2].lng, 9),
          ...route(customers[2].lat, customers[2].lng, customers[3].lat, customers[3].lng, 8),
        ],
        startedAt: minutesAgo(185),
      },
      {
        // Pedro entregou para Beatriz
        delivererId: delivererIds[2],
        deliveries: [
          {
            customerId: customerIds[4], // Beatriz — Chácara Cachoeira
            pickupCode: 'M9N0O',
            deliveryCode: 'N1M2L',
            createdAt: minutesAgo(300),
            pickedUpAt: minutesAgo(285),
            deliveredAt: minutesAgo(255),
            lat: customers[4].lat,
            lng: customers[4].lng,
          },
        ],
        routePoints: route(storeLat, storeLng, customers[4].lat, customers[4].lng, 10),
        startedAt: minutesAgo(285),
      },
    ]

    for (const group of deliveredOrders) {
      // Insere cada pedido do grupo
      for (let i = 0; i < group.deliveries.length; i++) {
        const d = group.deliveries[i]

        const { rows: [order] } = await client.query(`
          INSERT INTO orders (
            store_id, deliverer_id, customer_id, created_by_user_id,
            status, route_position, pickup_code, delivery_code,
            lat, lng, created_at, picked_up_at, delivered_at
          ) VALUES ($1,$2,$3,$4,'DELIVERED',$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id
        `, [
          storeId,
          group.delivererId,
          d.customerId,
          ownerId,
          i + 1,
          d.pickupCode,
          d.deliveryCode,
          storeLat, storeLng,
          d.createdAt,
          d.pickedUpAt,
          d.deliveredAt,
        ])

        // Prova de entrega (foto simulada)
        await client.query(`
          INSERT INTO proof_of_delivery (order_id, photo_url, lat, lng)
          VALUES ($1, $2, $3, $4)
        `, [
          order.id,
          `https://picsum.photos/seed/${order.id}/600/400`,
          d.lat,
          d.lng,
        ])

        console.log(`[seed] pedido entregue: #${order.id.slice(-8).toUpperCase()} → cliente ${i + 1} do grupo`)
      }

      // Insere histórico de localização do entregador ao longo da rota
      const totalPoints  = group.routePoints.length
      const routeDuration = 105 * 60_000 // ~105 min em ms
      const startedMs    = group.startedAt.getTime()

      for (let i = 0; i < totalPoints; i++) {
        const { lat, lng } = group.routePoints[i]
        const recordedAt  = new Date(startedMs + (i / totalPoints) * routeDuration)

        await client.query(`
          INSERT INTO location_history (deliverer_id, lat, lng, recorded_at)
          VALUES ($1,$2,$3,$4)
        `, [group.delivererId, lat, lng, recordedAt])
      }

      console.log(`[seed] ${totalPoints} pontos GPS inseridos para entregador ${group.delivererId.slice(-6)}`)
    }

    // ── Pedidos ativos (para testar o dashboard) ─────────────────────────────
    console.log('\n[seed] criando pedidos ativos...')

    const activeOrders = [
      { customerId: customerIds[5], status: 'PREPARING',  delivererId: null,           pickupCode: 'P1Q2R', deliveryCode: 'S3T4U' },
      { customerId: customerIds[6], status: 'ASSIGNED',   delivererId: delivererIds[0], pickupCode: 'V5W6X', deliveryCode: 'Y7Z8A' },
    ]

    for (const o of activeOrders) {
      await client.query(`
        INSERT INTO orders (
          store_id, deliverer_id, customer_id, created_by_user_id,
          status, pickup_code, delivery_code, lat, lng
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [
        storeId, o.delivererId, o.customerId, ownerId,
        o.status, o.pickupCode, o.deliveryCode,
        storeLat, storeLng,
      ])
      console.log(`[seed] pedido ativo: status=${o.status}`)
    }
  })

  console.log('\n[seed] concluído! ✓\n')
  console.log('─────────────────────────────────────────')
  console.log('  Painel web:  http://localhost:3000/login')
  console.log('  Email:       admin@logiflow.com')
  console.log('  Senha:       admin123')
  console.log('─────────────────────────────────────────\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] erro:', err)
  process.exit(1)
})
