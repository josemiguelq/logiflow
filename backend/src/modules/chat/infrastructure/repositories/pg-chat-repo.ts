import { DB } from '../../../../shared/db/client'
import { OrderMessage, UnreadCount, MessageRead } from '../../domain/entities'
import { IChatRepository, CreateMessageInput } from '../../application/ports'

// Coluna JSONB store_reads → array de recibos { store_user_id, store_user_name, read_at }.
function mapReads(raw: unknown): MessageRead[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => r != null)
    .map(r => ({
      storeUserId:   r.store_user_id as string,
      storeUserName: r.store_user_name as string,
      readAt:        new Date(r.read_at as string),
    }))
}

function mapMessage(r: Record<string, unknown>): OrderMessage {
  return {
    id:          r.id as string,
    orderId:     r.order_id as string,
    storeId:     r.store_id as string,
    delivererId: (r.deliverer_id as string) ?? null,
    senderType:  r.sender_type as 'store_user' | 'deliverer',
    senderId:    r.sender_id as string,
    senderName:  r.sender_name as string,
    body:        r.body as string,
    createdAt:         r.created_at as Date,
    readByStoreAt:     (r.read_by_store_at as Date) ?? null,
    readByDelivererAt: (r.read_by_deliverer_at as Date) ?? null,
    reads:       mapReads(r.store_reads),
  }
}

export function createPgChatRepo(db: DB): IChatRepository {
  const findOrderContext = async (orderId: string, storeId: string) => {
    const { rows } = await db.query(
      `SELECT deliverer_id FROM orders WHERE id = $1 AND store_id = $2 AND deleted_at IS NULL`,
      [orderId, storeId]
    )
    if (!rows[0]) return null
    return { delivererId: (rows[0].deliverer_id as string) ?? null }
  }

  const listByOrder = async (orderId: string, storeId: string): Promise<OrderMessage[]> => {
    const { rows } = await db.query(
      `SELECT * FROM order_messages
       WHERE order_id = $1 AND store_id = $2
       ORDER BY created_at ASC`,
      [orderId, storeId]
    )
    return rows.map(r => mapMessage(r as Record<string, unknown>))
  }

  const create = async (input: CreateMessageInput): Promise<OrderMessage> => {
    // A ponta que envia já lê a própria mensagem (carimbo na inserção).
    const { rows } = await db.query(
      `INSERT INTO order_messages
         (order_id, store_id, deliverer_id, sender_type, sender_id, sender_name, body,
          read_by_store_at, read_by_deliverer_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,
          CASE WHEN $4 = 'store_user' THEN now() ELSE NULL END,
          CASE WHEN $4 = 'deliverer'  THEN now() ELSE NULL END)
       RETURNING *`,
      [input.orderId, input.storeId, input.delivererId, input.senderType,
       input.senderId, input.senderName, input.body]
    )
    return mapMessage(rows[0] as Record<string, unknown>)
  }

  const markReadByStore = async (
    orderId: string, storeId: string, storeUserId: string, storeUserName: string
  ): Promise<void> => {
    // Badge por loja: carimba a primeira leitura da loja (comportamento atual).
    await db.query(
      `UPDATE order_messages SET read_by_store_at = now()
       WHERE order_id = $1 AND store_id = $2
         AND sender_type = 'deliverer' AND read_by_store_at IS NULL`,
      [orderId, storeId]
    )
    // Recibo por operador em store_reads: registra QUEM leu cada mensagem do
    // entregador. Idempotente — só anexa se este operador ainda não consta,
    // preservando o read_at da primeira leitura.
    await db.query(
      `UPDATE order_messages
       SET store_reads = store_reads || jsonb_build_object(
             'store_user_id', $3::text,
             'store_user_name', $4::text,
             'read_at', now())
       WHERE order_id = $1 AND store_id = $2 AND sender_type = 'deliverer'
         AND NOT (store_reads @> jsonb_build_array(jsonb_build_object('store_user_id', $3::text)))`,
      [orderId, storeId, storeUserId, storeUserName]
    )
  }

  // A rota do entregador já validou a posse do pedido antes de chamar.
  const markReadByDeliverer = async (orderId: string): Promise<void> => {
    await db.query(
      `UPDATE order_messages SET read_by_deliverer_at = now()
       WHERE order_id = $1 AND sender_type = 'store_user' AND read_by_deliverer_at IS NULL`,
      [orderId]
    )
  }

  const unreadByStore = async (storeId: string): Promise<UnreadCount[]> => {
    const { rows } = await db.query(
      `SELECT order_id, COUNT(*)::int AS count
       FROM order_messages
       WHERE store_id = $1 AND sender_type = 'deliverer' AND read_by_store_at IS NULL
       GROUP BY order_id`,
      [storeId]
    )
    return rows.map((r: Record<string, unknown>) => ({
      orderId: r.order_id as string,
      count:   Number(r.count),
    }))
  }

  return { findOrderContext, listByOrder, create, markReadByStore, markReadByDeliverer, unreadByStore }
}
