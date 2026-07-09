import { DB } from '../../../../shared/db/client'
import { generateCode } from '../../../../shared/utils/code-generator'
import { AutoRouteConfig, RodizioEntry, EnabledAutoRoute } from '../../domain/entities'
import {
  IAutoRouteRepository,
  UpsertAutoRouteConfigInput,
  CreatedAutoRoute,
} from '../../application/ports'

function mapConfig(r: Record<string, unknown>): AutoRouteConfig {
  return {
    storeId:      r.store_id as string,
    enabled:      r.enabled as boolean,
    waitMinutes:  Number(r.wait_minutes),
    queueSize:    Number(r.queue_size),
    maxOrders:    r.max_orders === null || r.max_orders === undefined ? null : Number(r.max_orders),
    turnPosition: Number(r.turn_position),
    updatedAt:    r.updated_at as Date,
  }
}

export function createPgAutoRouteRepo(db: DB): IAutoRouteRepository {
  const getConfig = async (storeId: string): Promise<AutoRouteConfig | null> => {
    const { rows } = await db.query(
      `SELECT * FROM store_auto_route_config WHERE store_id = $1`,
      [storeId]
    )
    return rows[0] ? mapConfig(rows[0] as Record<string, unknown>) : null
  }

  const getRodizio = async (storeId: string): Promise<RodizioEntry[]> => {
    const { rows } = await db.query(
      `SELECT sard.deliverer_id, sard.position, d.name, d.status, d.is_active,
              EXISTS (
                SELECT 1 FROM routes r
                WHERE r.deliverer_id = d.id AND r.store_id = sard.store_id
                  AND r.status IN ('CREATED','STARTED')
              ) AS has_active_route
       FROM store_auto_route_deliverers sard
       JOIN deliverers d ON d.id = sard.deliverer_id AND d.deleted_at IS NULL
       WHERE sard.store_id = $1
       ORDER BY sard.position ASC`,
      [storeId]
    )
    return rows.map((r: Record<string, unknown>) => ({
      delivererId:    r.deliverer_id as string,
      position:       Number(r.position),
      name:           r.name as string,
      status:         r.status as string,
      isActive:       r.is_active as boolean,
      hasActiveRoute: r.has_active_route as boolean,
    }))
  }

  return {
    getConfig,
    getRodizio,

    async upsertConfig(storeId, input: UpsertAutoRouteConfigInput, actor): Promise<AutoRouteConfig> {
      // Snapshot antes (config + rodízio) para auditoria antes/depois.
      const before = await getConfig(storeId)
      const beforeRodizio = await getRodizio(storeId)

      const result = await db.transaction(async (client) => {
        const { rows: [cfgRow] } = await client.query(
          `INSERT INTO store_auto_route_config
             (store_id, enabled, wait_minutes, queue_size, max_orders, updated_at, updated_by)
           VALUES ($1,$2,$3,$4,$5, now(), $6)
           ON CONFLICT (store_id) DO UPDATE SET
             enabled      = EXCLUDED.enabled,
             wait_minutes = EXCLUDED.wait_minutes,
             queue_size   = EXCLUDED.queue_size,
             max_orders   = EXCLUDED.max_orders,
             updated_at   = now(),
             updated_by   = EXCLUDED.updated_by
           RETURNING *`,
          [storeId, input.enabled, input.waitMinutes, input.queueSize, input.maxOrders, actor.id]
        )

        // Regrava o rodízio inteiro (position = índice na ordem enviada).
        await client.query(`DELETE FROM store_auto_route_deliverers WHERE store_id = $1`, [storeId])
        for (let i = 0; i < input.delivererIds.length; i++) {
          await client.query(
            `INSERT INTO store_auto_route_deliverers (store_id, deliverer_id, position)
             VALUES ($1,$2,$3)`,
            [storeId, input.delivererIds[i], i]
          )
        }

        const after = {
          ...mapConfig(cfgRow as Record<string, unknown>),
          rodizio: input.delivererIds,
        }
        await client.query(
          `INSERT INTO store_auto_route_config_audit
             (store_id, action, before, after, changed_by, changed_by_name)
           VALUES ($1, 'UPDATED', $2, $3, $4, $5)`,
          [
            storeId,
            before ? JSON.stringify({ ...before, rodizio: beforeRodizio.map(r => r.delivererId) }) : null,
            JSON.stringify(after),
            actor.id,
            actor.name,
          ]
        )

        return mapConfig(cfgRow as Record<string, unknown>)
      })

      return result
    },

    async listEnabled(): Promise<EnabledAutoRoute[]> {
      const { rows: cfgRows } = await db.query(
        `SELECT * FROM store_auto_route_config WHERE enabled = true`
      )
      if (cfgRows.length === 0) return []

      const storeIds = cfgRows.map((r: Record<string, unknown>) => r.store_id as string)
      const { rows: rodRows } = await db.query(
        `SELECT sard.store_id, sard.deliverer_id, sard.position, d.name, d.status, d.is_active,
                EXISTS (
                  SELECT 1 FROM routes r
                  WHERE r.deliverer_id = d.id AND r.store_id = sard.store_id
                    AND r.status IN ('CREATED','STARTED')
                ) AS has_active_route
         FROM store_auto_route_deliverers sard
         JOIN deliverers d ON d.id = sard.deliverer_id AND d.deleted_at IS NULL
         WHERE sard.store_id = ANY($1::uuid[])
         ORDER BY sard.store_id, sard.position ASC`,
        [storeIds]
      )

      const byStore = new Map<string, RodizioEntry[]>()
      for (const r of rodRows as Record<string, unknown>[]) {
        const sid = r.store_id as string
        const list = byStore.get(sid) ?? []
        list.push({
          delivererId:    r.deliverer_id as string,
          position:       Number(r.position),
          name:           r.name as string,
          status:         r.status as string,
          isActive:       r.is_active as boolean,
          hasActiveRoute: r.has_active_route as boolean,
        })
        byStore.set(sid, list)
      }

      return cfgRows.map((r: Record<string, unknown>) => ({
        ...mapConfig(r),
        rodizio: byStore.get(r.store_id as string) ?? [],
      }))
    },

    async createRouteAndAdvance(input): Promise<CreatedAutoRoute> {
      const { storeId, delivererId, orderIds, nextTurnPosition } = input

      return db.transaction(async (client) => {
        const assignedOrderIds: string[] = []
        let position = 1
        for (const orderId of orderIds) {
          // Revalida sob lock: só atribui se ainda está PREPARING e sem entregador
          // (um entregador pode ter retirado o pedido antes do gatilho).
          const { rows: [order] } = await client.query(
            `SELECT id, status, deliverer_id FROM orders
             WHERE id = $1 AND store_id = $2 FOR UPDATE`,
            [orderId, storeId]
          )
          if (!order) continue
          if (order.status !== 'PREPARING' || order.deliverer_id !== null) continue

          await client.query(
            `UPDATE orders SET deliverer_id = $2, route_position = $3, status = 'ASSIGNED',
                    accepted_at = COALESCE(accepted_at, now()),
                    reserved_by = NULL, reserved_at = NULL
             WHERE id = $1`,
            [orderId, delivererId, position]
          )
          assignedOrderIds.push(orderId as string)
          position++
        }

        // Nenhum pedido elegível (todos já retirados manualmente) — não cria rota
        // e NÃO avança o ponteiro: o entregador da vez não recebeu nada, mantém a vez.
        if (assignedOrderIds.length === 0) {
          return { routeId: '', pickupCode: '', assignedOrderIds: [] }
        }

        const pickupCode = generateCode()
        const { rows: [routeRow] } = await client.query(
          `INSERT INTO routes (store_id, deliverer_id, pickup_code) VALUES ($1,$2,$3) RETURNING id`,
          [storeId, delivererId, pickupCode]
        )
        const routeId = routeRow.id as string

        await client.query(
          `UPDATE orders SET route_id = $1 WHERE id = ANY($2::uuid[])`,
          [routeId, assignedOrderIds]
        )

        // Auditoria (system): log na rota + em cada pedido.
        const now = new Date().toISOString()
        const routeLog = JSON.stringify([{
          at: now, by: { type: 'system' }, action: 'CREATED',
          details: { trigger: 'auto_route', orderCount: assignedOrderIds.length },
        }])
        await client.query(
          `UPDATE routes SET log = COALESCE(log, '[]'::jsonb) || $2::jsonb WHERE id = $1`,
          [routeId, routeLog]
        )
        const orderLog = JSON.stringify([{
          at: now, by: { type: 'system' }, action: 'ASSIGNED',
          details: { delivererId, routeId, trigger: 'auto_route' },
        }])
        await client.query(
          `UPDATE orders SET log = COALESCE(log, '[]'::jsonb) || $2::jsonb WHERE id = ANY($1::uuid[])`,
          [assignedOrderIds, orderLog]
        )

        await client.query(
          `UPDATE store_auto_route_config SET turn_position = $2, updated_at = now() WHERE store_id = $1`,
          [storeId, nextTurnPosition]
        )

        return { routeId, pickupCode, assignedOrderIds }
      })
    },
  }
}
