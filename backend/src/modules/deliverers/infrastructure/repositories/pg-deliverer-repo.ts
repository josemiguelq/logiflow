import bcrypt from 'bcryptjs'
import { DB } from '../../../../shared/db/client'
import { Deliverer, DelivererStatus } from '../../domain/entities'

function mapRow(r: Record<string, unknown>): Deliverer {
  return {
    id:              r.id as string,
    storeId:         r.store_id as string,
    name:            r.name as string,
    email:           r.email as string | undefined,
    username:        r.username as string,
    passwordHash:    r.password_hash as string,
    profileImageUrl: r.profile_image_url as string | undefined,
    status:          r.status as DelivererStatus,
    isActive:        r.is_active as boolean,
    needsOnboarding: r.needs_onboarding as boolean,
    createdAt:       r.created_at as Date,
  }
}

export function createPgDelivererRepo(db: DB) {
  return {
    async findByStore(storeId: string): Promise<Omit<Deliverer, 'passwordHash'>[]> {
      const { rows } = await db.query(
        `SELECT id, store_id, name, email, username, profile_image_url, status, is_active, needs_onboarding, created_at
         FROM deliverers WHERE store_id = $1 ORDER BY is_active DESC, name ASC`,
        [storeId]
      )
      return rows.map((r: Record<string, unknown>) => { const { passwordHash: _, ...rest } = mapRow(r); return rest })
    },

    // IDs dos entregadores ativos SEM rota em andamento (nenhuma rota
    // CREATED/STARTED) — usado para notificar quem está livre para retirar.
    async findIdleIds(storeId: string): Promise<string[]> {
      const { rows } = await db.query<{ id: string }>(
        `SELECT d.id FROM deliverers d
         WHERE d.store_id = $1 AND d.is_active = true
           AND NOT EXISTS (
             SELECT 1 FROM routes r
             WHERE r.deliverer_id = d.id AND r.status IN ('CREATED','STARTED')
           )`,
        [storeId]
      )
      return rows.map(r => r.id)
    },

    // Contagem de entregadores: disponíveis (status AVAILABLE), em rota ativa e
    // sem rota ativa. `active` = total ativos (is_active), mantido por compat.
    async routeStatusCounts(storeId: string): Promise<{ available: number; active: number; inRoute: number; idle: number }> {
      const { rows } = await db.query<{ available: string; active: string; in_route: string; idle: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE d.is_active AND d.status = 'AVAILABLE') AS available,
           COUNT(*) FILTER (WHERE d.is_active) AS active,
           COUNT(*) FILTER (WHERE d.is_active AND EXISTS (
             SELECT 1 FROM routes r WHERE r.deliverer_id = d.id AND r.status IN ('CREATED','STARTED')
           )) AS in_route,
           COUNT(*) FILTER (WHERE d.is_active AND NOT EXISTS (
             SELECT 1 FROM routes r WHERE r.deliverer_id = d.id AND r.status IN ('CREATED','STARTED')
           )) AS idle
         FROM deliverers d
         WHERE d.store_id = $1`,
        [storeId]
      )
      const r = rows[0]
      return {
        available: Number(r?.available ?? 0),
        active:    Number(r?.active ?? 0),
        inRoute:   Number(r?.in_route ?? 0),
        idle:      Number(r?.idle ?? 0),
      }
    },

    async findById(id: string, storeId: string): Promise<Deliverer | null> {
      const { rows } = await db.query(
        'SELECT * FROM deliverers WHERE id = $1 AND store_id = $2',
        [id, storeId]
      )
      return rows[0] ? mapRow(rows[0]) : null
    },

    async create(data: {
      storeId: string
      name: string
      email?: string
      username: string
      password: string
    }): Promise<Omit<Deliverer, 'passwordHash'>> {
      const passwordHash = await bcrypt.hash(data.password, 10)
      const { rows } = await db.query(
        `INSERT INTO deliverers (store_id, name, email, username, password_hash)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [data.storeId, data.name, data.email ?? null, data.username, passwordHash]
      )
      const { passwordHash: _, ...rest } = mapRow(rows[0])
      return rest
    },

    async update(
      id: string,
      storeId: string,
      data: { name?: string; email?: string | null; username?: string; password?: string }
    ): Promise<Omit<Deliverer, 'passwordHash'> | null> {
      const sets: string[] = []
      const values: unknown[] = []
      let i = 1

      if (data.name !== undefined)     { sets.push(`name = $${i++}`);          values.push(data.name) }
      if (data.email !== undefined)    { sets.push(`email = $${i++}`);         values.push(data.email) }
      if (data.username !== undefined) { sets.push(`username = $${i++}`);      values.push(data.username) }
      if (data.password)               { sets.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(data.password, 10)) }

      if (sets.length === 0) return null

      values.push(id, storeId)
      const { rows } = await db.query(
        `UPDATE deliverers SET ${sets.join(', ')}
         WHERE id = $${i++} AND store_id = $${i++} RETURNING *`,
        values
      )
      if (!rows[0]) return null; const { passwordHash: _, ...rest } = mapRow(rows[0]); return rest
    },

    async setActive(id: string, storeId: string, active: boolean): Promise<void> {
      await db.query(
        'UPDATE deliverers SET is_active = $1 WHERE id = $2 AND store_id = $3',
        [active, id, storeId]
      )
    },

    async updateStatus(id: string, storeId: string, status: DelivererStatus): Promise<void> {
      await db.query(
        'UPDATE deliverers SET status = $1 WHERE id = $2 AND store_id = $3',
        [status, id, storeId]
      )
    },

    async suggestForOrder(storeId: string) {
      // Além da contagem de pedidos ativos, traz a rota ativa do entregador
      // (CREATED/STARTED com pedidos pendentes), se houver, para que o operador
      // possa optar por adicionar o pedido a ela em vez de abrir uma rota nova.
      const { rows } = await db.query(
        `SELECT d.id, d.name, d.status,
                COUNT(o.id)         AS active_orders,
                ar.route_id         AS active_route_id,
                ar.pending_count    AS route_pending_count
         FROM deliverers d
         LEFT JOIN orders o ON o.deliverer_id = d.id
           AND o.status NOT IN ('DELIVERED','CANCELLED')
         LEFT JOIN LATERAL (
           SELECT r.id AS route_id,
                  COUNT(ro.id) FILTER (WHERE ro.status NOT IN ('DELIVERED','CANCELLED')) AS pending_count
           FROM routes r
           LEFT JOIN orders ro ON ro.route_id = r.id
           WHERE r.deliverer_id = d.id AND r.status IN ('CREATED','STARTED')
           GROUP BY r.id
           HAVING COUNT(ro.id) FILTER (WHERE ro.status NOT IN ('DELIVERED','CANCELLED')) > 0
           ORDER BY r.created_at DESC
           LIMIT 1
         ) ar ON true
         WHERE d.store_id = $1 AND d.status != 'OFFLINE' AND d.is_active = true
         GROUP BY d.id, ar.route_id, ar.pending_count
         ORDER BY active_orders ASC, d.name ASC`,
        [storeId]
      )
      return rows
    },
  }
}
