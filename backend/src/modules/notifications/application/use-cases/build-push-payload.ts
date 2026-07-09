import type { PushPayload } from '../../domain/push-ports'

export function buildPushPayload(
  statusEvent: string,
  orderId: string | undefined,
  customerName: string,
): PushPayload {
  const data = { orderId: orderId ?? '', event: statusEvent }

  switch (statusEvent) {
    case 'AUTO_ROUTE_ASSIGNED':
      return {
        title: 'Nova rota atribuída 🛵',
        body:  'Você é o entregador da vez! Uma nova rota foi criada para você.',
        data,
      }
    case 'AUTO_ROUTE_NEXT':
      return {
        title: 'Você é o próximo! 🔔',
        body:  'Fique preparado — a próxima rota automática será atribuída a você.',
        data,
      }
    case 'NEW_MESSAGE':
      return {
        title: 'Nova mensagem 💬',
        body:  customerName
          ? `Nova mensagem sobre o pedido de ${customerName}`
          : 'Você recebeu uma nova mensagem',
        data,
      }
    case 'PREPARING':
      return {
        title: 'Novo pedido disponível 🛒',
        body:  `Pedido de ${customerName} aguarda entregador`,
        data,
      }
    case 'CANCELLED':
      return {
        title: 'Pedido cancelado',
        body:  `O pedido de ${customerName} foi cancelado`,
        data,
      }
    case 'ROUTE_UPDATED':
      return {
        title: 'Rota atualizada 🔄',
        body:  'Sua rota foi alterada. Confira a nova ordem das entregas.',
        data,
      }
    case 'ADDRESS_CHANGED':
      return {
        title: 'Endereço de entrega alterado 📍',
        body:  `O endereço de entrega de ${customerName} foi atualizado. Confira no app.`,
        data,
      }
    case 'DELAYED_PICKUP_YELLOW':
      return {
        title: 'Entrega atrasada ⏰',
        body:  `O pedido de ${customerName} está em rota há mais de 50 min. Confira.`,
        data,
      }
    case 'DELAYED_PICKUP_RED':
      return {
        title: 'Entrega muito atrasada 🚨',
        body:  `O pedido de ${customerName} está em rota há mais de 1 hora. Verifique com urgência.`,
        data,
      }
    case 'PRIORITY_OVERDUE':
      return {
        title: 'Pedido prioritário atrasado 👑',
        body:  `O prazo de entrega do pedido de ${customerName} já passou. Priorize.`,
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
