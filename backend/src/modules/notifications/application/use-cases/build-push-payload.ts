import type { PushPayload } from '../../domain/push-ports'

export function buildPushPayload(
  statusEvent: string,
  orderId: string,
  customerName: string,
): PushPayload {
  const data = { orderId, event: statusEvent }

  switch (statusEvent) {
    case 'ASSIGNED':
      return {
        title: 'Novo pedido para coletar 📦',
        body:  `Pedido de ${customerName} está esperando na loja`,
        data,
      }
    case 'CANCELLED':
      return {
        title: 'Pedido cancelado',
        body:  `O pedido de ${customerName} foi cancelado`,
        data,
      }
    default:
      return {
        title: 'Pedido atualizado',
        body:  `Status do pedido de ${customerName} foi alterado`,
        data,
      }
  }
}
