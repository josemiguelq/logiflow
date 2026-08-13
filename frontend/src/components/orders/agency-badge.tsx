import { Building2 } from 'lucide-react'

/**
 * Badge de entrega terceirizada ("via agência/parceiro"): o pedido é levado pelo
 * entregador da loja até um ponto de terceiro (ex.: agência dos Correios), não ao
 * endereço do cliente.
 */
export function AgencyBadge() {
  return (
    <span
      title="Entrega terceirizada: o entregador deixa em um ponto de terceiro (ex.: agência dos Correios)"
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700"
    >
      <Building2 className="h-3 w-3" />
      Via agência
    </span>
  )
}
