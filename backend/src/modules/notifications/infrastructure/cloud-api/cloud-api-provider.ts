import { IWhatsAppProvider, TemplateParams } from '../../domain/ports'
import { DB } from '../../../../shared/db/client'

// Provider oficial: WhatsApp Cloud API da Meta (Graph API).
// Fase 1 = um número central (credenciais por env). O `storeId` é aceito para a
// fase 2 (número próprio por loja), quando as credenciais passarão a ser
// resolvidas por loja a partir do banco.

type Logger = {
  info:  (obj: unknown, msg?: string) => void
  warn:  (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

const consoleLogger: Logger = {
  info:  (obj, msg) => console.log(msg ?? '', obj),
  warn:  (obj, msg) => console.warn(msg ?? '', obj),
  error: (obj, msg) => console.error(msg ?? '', obj),
}

// Normaliza para o formato E.164 sem '+', como a Cloud API espera (ex.: 556799...).
// Assume Brasil (55) quando o DDI não vem no número.
function normalizePhone(phone: string): string {
  let n = phone.replace(/\D/g, '')
  if (!n.startsWith('55')) n = `55${n}`
  return n
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createCloudApiProvider(_db: DB, logger: Logger = consoleLogger): IWhatsAppProvider {
  const log = logger

  const graphVersion   = process.env.WHATSAPP_GRAPH_VERSION ?? 'v21.0'
  const phoneNumberId  = process.env.WHATSAPP_PHONE_NUMBER_ID ?? ''
  const accessToken    = process.env.WHATSAPP_ACCESS_TOKEN ?? ''
  const configured     = Boolean(phoneNumberId && accessToken)

  async function postMessage(payload: Record<string, unknown>): Promise<string | null> {
    if (!configured) {
      throw new Error('WhatsApp Cloud API não configurada (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN)')
    }
    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`
    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    })

    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>
      error?: { message?: string; code?: number; error_data?: { details?: string } }
    }

    if (!res.ok || data.error) {
      const detail = data.error?.error_data?.details ?? data.error?.message ?? `HTTP ${res.status}`
      throw new Error(`Cloud API: ${detail}`)
    }
    return data.messages?.[0]?.id ?? null
  }

  return {
    async sendTemplate(storeId, phone, templateName, langCode, params: TemplateParams) {
      const components: Array<Record<string, unknown>> = []

      if (params.body.length > 0) {
        components.push({
          type: 'body',
          parameters: params.body.map((text) => ({ type: 'text', text })),
        })
      }
      // Botão de URL dinâmico (índice 0) — sufixo é o id do pedido para o rastreio.
      if (params.buttonUrlSuffix) {
        components.push({
          type:       'button',
          sub_type:   'url',
          index:      '0',
          parameters: [{ type: 'text', text: params.buttonUrlSuffix }],
        })
      }

      const id = await postMessage({
        to:   normalizePhone(phone),
        type: 'template',
        template: {
          name:     templateName,
          language: { code: langCode },
          ...(components.length > 0 ? { components } : {}),
        },
      })
      log.info({ storeId, templateName, waId: id }, '[whatsapp] template enviado')
      return id
    },

    async sendMessage(storeId, phone, text) {
      // Texto livre — só entregue se houver janela de 24h aberta. Uso futuro.
      const id = await postMessage({
        to:   normalizePhone(phone),
        type: 'text',
        text: { body: text, preview_url: true },
      })
      log.info({ storeId, waId: id }, '[whatsapp] texto livre enviado')
      return id
    },

    // ── Métodos de conexão: não se aplicam ao número central (não há QR). ──
    async getQRCode() {
      return null
    },
    async connect() {
      /* no-op: o número central é configurado por env, não pareado */
    },
    async disconnect() {
      /* no-op */
    },
    async getStatus() {
      return configured ? 'CONNECTED' : 'DISCONNECTED'
    },
    async reconnectAll() {
      /* no-op: sem sessões para reconectar */
    },
  }
}
