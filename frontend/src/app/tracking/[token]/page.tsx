import { redirect } from 'next/navigation'

// Página pública de rastreio legada — consolidada em /rastreio/[token], que tem
// o gate de senha (últimos 4 dígitos do telefone). Mantemos a rota redirecionando
// para não quebrar links antigos.
export default async function LegacyTrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  redirect(`/rastreio/${token}`)
}
