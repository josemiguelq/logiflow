import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { db } from '../../../shared/db/client'
import { requireStoreUser } from '../../../shared/middleware/auth'
import { requireScope } from '../../../shared/middleware/rbac'
import { createPgCustomerRepo } from '../infrastructure/repositories/pg-customer-repo'

// Snapshot dos campos auditáveis de um endereço.
type AddrSnap = {
  label?: string; address?: string; number?: string | null; complement?: string | null
  lat?: number | null; lng?: number | null; isDefault?: boolean
}
const ADDR_FIELDS: (keyof AddrSnap)[] = ['label', 'address', 'number', 'complement', 'lat', 'lng', 'isDefault']
const snap = (a: {
  label?: string; address?: string; number?: string | null; complement?: string | null
  lat?: number | null; lng?: number | null; isDefault?: boolean
}): AddrSnap => ({
  label:      a.label,
  address:    a.address,
  number:     a.number ?? null,
  complement: a.complement ?? null,
  lat:        a.lat ?? null,
  lng:        a.lng ?? null,
  isDefault:  !!a.isDefault,
})
const addrChanged = (b: AddrSnap, a: AddrSnap) => ADDR_FIELDS.some(f => b[f] !== a[f])

const addressSchema = z.object({
  id:         z.string().uuid().optional(),
  label:      z.string().min(1).default('Principal'),
  address:    z.string().min(1),
  number:     z.string().optional(),
  complement: z.string().optional(),
  lat:        z.number().optional(),
  lng:        z.number().optional(),
  isDefault:  z.boolean().optional(),
})

const customerCreateSchema = z.object({
  name:      z.string().min(1),
  phone:     z.string().min(8),
  addresses: z.array(addressSchema).min(1),
})

const customerUpdateSchema = z.object({
  name:      z.string().min(1).optional(),
  phone:     z.string().min(8).optional(),
  addresses: z.array(addressSchema).min(1).optional(),
})

export async function customerRoutes(app: FastifyInstance) {
  const repo = createPgCustomerRepo(db)

  // Registra uma alteração de endereço (quem/quando/o quê). Best-effort: falha
  // só loga, não reverte a operação principal.
  const auditAddress = (
    req: FastifyRequest, customerId: string, addressId: string | null,
    action: 'CREATED' | 'UPDATED' | 'DELETED', before: AddrSnap | null, after: AddrSnap | null,
  ) =>
    db.query(
      `INSERT INTO customer_address_audit
         (store_id, customer_id, address_id, action, before, after, changed_by, changed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.actor.storeId, customerId, addressId, action,
       before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null,
       req.actor.sub, req.actor.name],
    ).catch((err) => req.log.error({ err }, 'customer address audit failed'))

  // Estado atual de um endereço (para capturar o "antes" em edição/exclusão).
  const fetchAddr = async (addressId: string, customerId: string, storeId: string) => {
    const { rows: [r] } = await db.query(
      `SELECT id, label, address, number, complement, lat, lng, is_default
       FROM customer_addresses WHERE id = $1 AND customer_id = $2 AND store_id = $3`,
      [addressId, customerId, storeId],
    )
    if (!r) return null
    const row = r as Record<string, unknown>
    return snap({
      label: row.label as string, address: row.address as string,
      number: row.number as string | null, complement: row.complement as string | null,
      lat: row.lat as number | null, lng: row.lng as number | null, isDefault: row.is_default as boolean,
    })
  }

  app.get(
    '/customers',
    { preHandler: requireStoreUser },
    async (req) => {
      const { search, page, all } = req.query as { search?: string; page?: string; all?: string }
      if (all === 'true') {
        const { items, total } = await repo.findAllByStore(req.actor.storeId)
        return { items, total, page: 1, pages: 1 }
      }
      const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1)
      const { items, total } = await repo.findByStore(req.actor.storeId, search, pageNum)
      const pages = Math.max(1, Math.ceil(total / 15))
      return { items, total, page: pageNum, pages }
    }
  )

  app.get(
    '/customers/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const customer = await repo.findById(id, req.actor.storeId)
      if (!customer) return reply.code(404).send({ error: 'Not found' })
      return customer
    }
  )

  app.post(
    '/customers',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const body = customerCreateSchema.parse(req.body)
      const existing = await repo.findByPhone(req.actor.storeId, body.phone)
      if (existing) return existing

      const customer = await repo.create(
        { storeId: req.actor.storeId, name: body.name, phone: body.phone },
        body.addresses.map((a, i) => ({ ...a, isDefault: i === 0 || !!a.isDefault }))
      )
      for (const addr of customer.addresses) {
        await auditAddress(req, customer.id, addr.id, 'CREATED', null, snap(addr))
      }
      return reply.code(201).send(customer)
    }
  )

  app.put(
    '/customers/:id',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body   = customerUpdateSchema.parse(req.body)

      const existing = await repo.findById(id, req.actor.storeId)
      if (!existing) return reply.code(404).send({ error: 'Not found' })

      await repo.update(id, req.actor.storeId, { name: body.name, phone: body.phone })

      // Sync address sub-table when addresses are provided
      if (body.addresses) {
        const currentIds  = new Set(existing.addresses.map(a => a.id))
        const incomingIds = new Set(
          body.addresses.filter(a => a.id).map(a => a.id!)
        )

        // Delete addresses that were removed
        for (const addrId of currentIds) {
          if (!incomingIds.has(addrId)) {
            const old = existing.addresses.find(a => a.id === addrId)
            await repo.removeAddress(addrId, id, req.actor.storeId)
            if (old) await auditAddress(req, id, addrId, 'DELETED', snap(old), null)
          }
        }

        // Insert new / update existing
        for (let i = 0; i < body.addresses.length; i++) {
          const addr = body.addresses[i]!
          const isDefault = i === 0 || !!addr.isDefault
          if (addr.id) {
            const old = existing.addresses.find(a => a.id === addr.id)
            const after = snap({ ...addr, isDefault })
            await repo.updateAddress(addr.id, id, req.actor.storeId, { ...addr, isDefault })
            // Só audita quando algo realmente mudou (o replace-all dá UPDATE em todos).
            if (old && addrChanged(snap(old), after)) {
              await auditAddress(req, id, addr.id, 'UPDATED', snap(old), after)
            }
          } else {
            const created = await repo.addAddress(id, req.actor.storeId, { ...addr, isDefault })
            await auditAddress(req, id, created.id, 'CREATED', null, snap(created))
          }
        }
      }

      return repo.findById(id, req.actor.storeId)
    }
  )

  // ── Delete ──────────────────────────────────────────────────────────────────

  app.delete(
    '/customers/:id',
    { preHandler: [requireStoreUser, requireScope('customers:delete')] },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const existing = await repo.findById(id, req.actor.storeId)
      if (!existing) return reply.code(404).send({ error: 'Cliente não encontrado' })
      await db.query(`DELETE FROM customers WHERE id = $1 AND store_id = $2`, [id, req.actor.storeId])
      return { ok: true }
    }
  )

  app.delete(
    '/customers',
    { preHandler: [requireStoreUser, requireScope('customers:delete')] },
    async (req, reply) => {
      const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body)
      const { rowCount } = await db.query(
        `DELETE FROM customers WHERE id = ANY($1::uuid[]) AND store_id = $2`,
        [ids, req.actor.storeId]
      )
      return { ok: true, deleted: rowCount ?? 0 }
    }
  )

  // ── Address sub-routes ──────────────────────────────────────────────────────

  app.post(
    '/customers/:id/addresses',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id } = req.params as { id: string }
      const body = addressSchema.parse(req.body)
      const addr = await repo.addAddress(id, req.actor.storeId, body)
      await auditAddress(req, id, addr.id, 'CREATED', null, snap(addr))
      return reply.code(201).send(addr)
    }
  )

  app.patch(
    '/customers/:id/addresses/:addressId',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id, addressId } = req.params as { id: string; addressId: string }
      const body = addressSchema.partial().parse(req.body)
      const before = await fetchAddr(addressId, id, req.actor.storeId)
      const addr = await repo.updateAddress(addressId, id, req.actor.storeId, body)
      if (!addr) return reply.code(404).send({ error: 'Not found' })
      if (before && addrChanged(before, snap(addr))) {
        await auditAddress(req, id, addressId, 'UPDATED', before, snap(addr))
      }
      return addr
    }
  )

  app.delete(
    '/customers/:id/addresses/:addressId',
    { preHandler: requireStoreUser },
    async (req, reply) => {
      const { id, addressId } = req.params as { id: string; addressId: string }
      const before = await fetchAddr(addressId, id, req.actor.storeId)
      const ok = await repo.removeAddress(addressId, id, req.actor.storeId)
      if (!ok) return reply.code(404).send({ error: 'Not found' })
      if (before) await auditAddress(req, id, addressId, 'DELETED', before, null)
      return reply.send({ ok: true })
    }
  )

  // Histórico de alterações de endereço (quem/quando/o quê).
  app.get(
    '/customers/:id/address-history',
    { preHandler: [requireStoreUser, requireScope('customers:view')] },
    async (req) => {
      const { id } = req.params as { id: string }
      const { rows } = await db.query(
        `SELECT id, address_id, action, before, after, changed_by_name, changed_at
         FROM customer_address_audit
         WHERE customer_id = $1 AND store_id = $2
         ORDER BY changed_at DESC
         LIMIT 200`,
        [id, req.actor.storeId]
      )
      return (rows as Record<string, unknown>[]).map(r => ({
        id:            r.id,
        addressId:     r.address_id,
        action:        r.action,
        before:        r.before,
        after:         r.after,
        changedByName: r.changed_by_name,
        changedAt:     r.changed_at,
      }))
    }
  )
}
