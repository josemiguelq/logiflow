import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startTestPostgres, type TestPg } from '../../../../test/pg-testcontainer'
import { createPgRouteRepo } from './pg-route-repo'

// Integration tests for the routes data layer, running the REAL SQL against a
// throwaway Postgres (testcontainers). Requires Docker.
//
// Gated behind RUN_INTEGRATION so `npm test` stays Docker-free; run with:
//   npm run test:int      (sets RUN_INTEGRATION=1)
const RUN = process.env.RUN_INTEGRATION === '1'

describe.skipIf(!RUN)('pg-route-repo (integration · testcontainers)', () => {
  let pg: TestPg
  let repo: ReturnType<typeof createPgRouteRepo>

  let storeId: string
  let userId: string
  let delivererId: string
  let customerId: string

  beforeAll(async () => {
    pg = await startTestPostgres()
    repo = createPgRouteRepo(pg.db)
  }, 180_000)

  afterAll(async () => {
    if (pg) await pg.stop()
  })

  beforeEach(async () => {
    await pg.db.query(
      `TRUNCATE orders, routes, customer_addresses, customers, deliverers, store_users, stores RESTART IDENTITY CASCADE`,
    )
    storeId = (await pg.db.query(`INSERT INTO stores (name) VALUES ('Loja') RETURNING id`)).rows[0].id
    userId = (
      await pg.db.query(
        `INSERT INTO store_users (store_id, name, email, username, password_hash, role)
         VALUES ($1, 'Dono', 'dono@loja.com', 'dono', 'x', 'OWNER') RETURNING id`,
        [storeId],
      )
    ).rows[0].id
    delivererId = (
      await pg.db.query(
        `INSERT INTO deliverers (store_id, name, username, password_hash, status)
         VALUES ($1, 'Joel', 'joel', 'x', 'AVAILABLE') RETURNING id`,
        [storeId],
      )
    ).rows[0].id
    customerId = (
      await pg.db.query(
        `INSERT INTO customers (store_id, name, phone, address)
         VALUES ($1, 'José', '67999990000', 'Rua Cliente') RETURNING id`,
        [storeId],
      )
    ).rows[0].id
  })

  async function makeOrder(opts: {
    routeId?: string
    position?: number
    status?: string
    address?: string
    code?: string
  } = {}): Promise<string> {
    const { rows } = await pg.db.query(
      `INSERT INTO orders
         (store_id, customer_id, created_by_user_id, pickup_code, delivery_code,
          status, route_id, route_position, delivery_address)
       VALUES ($1, $2, $3, 'PU001', $4, $5::order_status, $6, $7, $8) RETURNING id`,
      [
        storeId,
        customerId,
        userId,
        opts.code ?? 'DC001',
        opts.status ?? 'PREPARING',
        opts.routeId ?? null,
        opts.position ?? null,
        opts.address ?? 'Rua A, 1',
      ],
    )
    return rows[0].id
  }

  it('create() inserts a CREATED route for the store/deliverer', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })

    expect(route.id).toBeTruthy()
    expect(route.storeId).toBe(storeId)
    expect(route.delivererId).toBe(delivererId)
    expect(route.pickupCode).toBe('ABCDE')
    expect(route.status).toBe('CREATED')
    expect(route.finishedAt).toBeFalsy()
  })

  it('linkOrders() attaches the given orders to the route (no-op for empty list)', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })
    const o1 = await makeOrder({ code: 'DC001' })
    const o2 = await makeOrder({ code: 'DC002' })

    await expect(repo.linkOrders(route.id, [])).resolves.toBeUndefined()
    await repo.linkOrders(route.id, [o1, o2])

    const { rows } = await pg.db.query(
      `SELECT id FROM orders WHERE route_id = $1`,
      [route.id],
    )
    expect(rows.map((r: { id: string }) => r.id).sort()).toEqual([o1, o2].sort())
  })

  it('findById() returns the route with its orders sorted by position', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })
    await makeOrder({ routeId: route.id, position: 2, code: 'DC002', address: 'Rua B', status: 'ON_ROUTE' })
    await makeOrder({ routeId: route.id, position: 1, code: 'DC001', address: 'Rua A', status: 'ASSIGNED' })

    const found = await repo.findById(route.id, storeId)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(route.id)
    expect(found!.deliverer.name).toBe('Joel')
    expect(found!.orderCount).toBe(2)
    expect(found!.orders.map((o) => o.routePosition)).toEqual([1, 2])
    expect(found!.orders[0].customerName).toBe('José')
    expect(found!.orders[0].customerAddress).toBe('Rua A')
    expect(found!.orders[0].status).toBe('ASSIGNED')
  })

  it('findById() returns null for a route of another store', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })
    const otherStore = (await pg.db.query(`INSERT INTO stores (name) VALUES ('Outra') RETURNING id`)).rows[0].id

    expect(await repo.findById(route.id, otherStore)).toBeNull()
  })

  it('findByStore() paginates the store routes with order counts', async () => {
    const r1 = await repo.create({ storeId, delivererId, pickupCode: 'AAAAA' })
    await repo.create({ storeId, delivererId, pickupCode: 'BBBBB' })
    await makeOrder({ routeId: r1.id, code: 'DC001' })
    await makeOrder({ routeId: r1.id, code: 'DC002' })

    const { items, total } = await repo.findByStore(storeId, 1, 15)

    expect(total).toBe(2)
    expect(items).toHaveLength(2)
    const r1Item = items.find((i) => i.id === r1.id)!
    expect(r1Item.orderCount).toBe(2)
    expect(r1Item.deliverer.name).toBe('Joel')
  })

  it('findByDeliverer() returns only non-finished routes that have orders', async () => {
    const active = await repo.create({ storeId, delivererId, pickupCode: 'AAAAA' })
    await makeOrder({ routeId: active.id, code: 'DC001' })

    const finished = await repo.create({ storeId, delivererId, pickupCode: 'BBBBB' })
    await makeOrder({ routeId: finished.id, code: 'DC002' })
    await repo.updateStatus(finished.id, storeId, 'FINISHED')

    // CREATED route with no orders — excluded by HAVING COUNT > 0
    await repo.create({ storeId, delivererId, pickupCode: 'CCCCC' })

    const routes = await repo.findByDeliverer(delivererId)

    expect(routes.map((r) => r.id)).toEqual([active.id])
  })

  it('updateStatus() to STARTED sets started_at', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })

    const updated = await repo.updateStatus(route.id, storeId, 'STARTED')

    expect(updated!.status).toBe('STARTED')
    expect(updated!.startedAt).toBeTruthy()
    expect(updated!.finishedAt).toBeFalsy()
  })

  it('updateStatus() to FINISHED sets finished_at; wrong store returns null', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })

    const finished = await repo.updateStatus(route.id, storeId, 'FINISHED')
    expect(finished!.status).toBe('FINISHED')
    expect(finished!.finishedAt).toBeTruthy()

    const otherStore = (await pg.db.query(`INSERT INTO stores (name) VALUES ('Outra') RETURNING id`)).rows[0].id
    expect(await repo.updateStatus(route.id, otherStore, 'STARTED')).toBeNull()
  })

  it('checkAndFinish() keeps the route open while an order is still pending', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })
    await makeOrder({ routeId: route.id, status: 'DELIVERED', code: 'DC001' })
    await makeOrder({ routeId: route.id, status: 'ON_ROUTE', code: 'DC002' })

    expect(await repo.checkAndFinish(route.id, storeId)).toBe(false)
    const { rows } = await pg.db.query(`SELECT status FROM routes WHERE id = $1`, [route.id])
    expect(rows[0].status).toBe('CREATED')
  })

  it('checkAndFinish() finishes the route when all orders are delivered/cancelled', async () => {
    const route = await repo.create({ storeId, delivererId, pickupCode: 'ABCDE' })
    await makeOrder({ routeId: route.id, status: 'DELIVERED', code: 'DC001' })
    await makeOrder({ routeId: route.id, status: 'CANCELLED', code: 'DC002' })

    expect(await repo.checkAndFinish(route.id, storeId)).toBe(true)
    const { rows } = await pg.db.query(
      `SELECT status, finished_at FROM routes WHERE id = $1`,
      [route.id],
    )
    expect(rows[0].status).toBe('FINISHED')
    expect(rows[0].finished_at).toBeTruthy()
  })
})
