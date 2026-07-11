import { FastifyInstance } from 'fastify'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { db } from '../../../shared/db/client'
import { createPgMessageLogRepo } from '../infrastructure/repositories/pg-message-log-repo'

// Webhook público da WhatsApp Cloud API (Meta). Sem auth de usuário — a proteção
// é a verificação de token (GET) e a assinatura HMAC (POST). Rotas:
//   GET  /webhooks/whatsapp  → handshake de verificação (hub.challenge)
//   POST /webhooks/whatsapp  → eventos de status (sent/delivered/read/failed) e inbound

const META_STATUS: Record<string, 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'> = {
  sent:      'SENT',
  delivered: 'DELIVERED',
  read:      'READ',
  failed:    'FAILED',
}

type WebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string
          status?: string
          errors?: Array<{ title?: string; message?: string }>
        }>
        messages?: Array<{ from?: string; id?: string; type?: string }>
      }
    }>
  }>
}

export async function whatsappWebhookRoutes(app: FastifyInstance) {
  const messageLog = createPgMessageLogRepo(db)

  // ── Verificação (Meta chama uma vez ao configurar o webhook) ──
  app.get('/webhooks/whatsapp', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>
    const mode      = q['hub.mode']
    const token     = q['hub.verify_token']
    const challenge = q['hub.challenge']
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.code(200).type('text/plain').send(challenge ?? '')
    }
    return reply.code(403).send({ error: 'verification failed' })
  })

  // ── Eventos ──
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const appSecret = process.env.WHATSAPP_APP_SECRET
    const rawBody   = (req as unknown as { rawBody?: string }).rawBody ?? ''

    // Valida a assinatura HMAC quando o segredo está configurado.
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'] as string | undefined
      const expected  = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
      const ok =
        !!signature &&
        signature.length === expected.length &&
        timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      if (!ok) {
        app.log.warn('[whatsapp] webhook com assinatura inválida — ignorado')
        return reply.code(401).send({ error: 'invalid signature' })
      }
    }

    // Responde 200 rápido (a Meta reenvia em caso de erro/timeout) e processa.
    const body = req.body as WebhookBody
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {}

        for (const st of value.statuses ?? []) {
          const mapped = st.status ? META_STATUS[st.status] : undefined
          if (!st.id || !mapped) continue
          const error = st.errors?.[0]
          const reason = error ? (error.message ?? error.title) : undefined
          try {
            await messageLog.markStatus(st.id, mapped, reason)
          } catch (err) {
            app.log.error({ err, waId: st.id, status: mapped }, '[whatsapp] falha ao gravar status do webhook')
          }
        }

        // Inbound: por ora só registra (base p/ a janela de 24h no futuro).
        for (const msg of value.messages ?? []) {
          app.log.info({ from: msg.from, waId: msg.id, type: msg.type }, '[whatsapp] mensagem recebida')
        }
      }
    }

    return reply.code(200).send({ ok: true })
  })
}
