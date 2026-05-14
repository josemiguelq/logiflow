'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import useSWR from 'swr'
import { api } from '@/lib/api'
import { Customer } from '@/types'
import { stripPhone, formatPhone } from '@/lib/phone'
import { CustomerForm, AddressEntry, geocodeAddress, toAddressEntries } from '../../_form'

interface Props { params: Promise<{ id: string }> }

export default function EditCustomerPage({ params }: Props) {
  const { id } = use(params)
  const router  = useRouter()
  const { data: customer, isLoading } = useSWR<Customer>(
    `/customers/${id}`,
    (url: string) => api.get<Customer>(url)
  )
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleSave(name: string, phone: string, addresses: AddressEntry[]) {
    const filled = addresses.filter(a => a.address.trim())
    if (!filled.length) { setError('Informe pelo menos um endereço'); return }
    setLoading(true)
    setError('')
    try {
      const withCoords = await Promise.all(
        filled.map(async (a, i) => {
          let { lat, lng } = a
          if (!lat || !lng) {
            const geo = await geocodeAddress(a.address.trim())
            if (geo) { lat = geo.lat; lng = geo.lng }
          }
          return {
            id:         a.id,
            label:      a.label,
            address:    a.address.trim(),
            complement: a.complement.trim() || undefined,
            isDefault:  i === 0,
            lat,
            lng,
          }
        })
      )
      await api.put(`/customers/${id}`, { name, phone: stripPhone(phone), addresses: withCoords })
      router.push('/customers')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200"
          style={{ borderTopColor: 'var(--color-primary)' }} />
      </div>
    )
  }

  if (!customer) {
    return <div className="p-6 text-gray-500">Cliente não encontrado.</div>
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/customers"
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Clientes
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Editar Cliente</h1>
      <CustomerForm
        initialName={customer.name}
        initialPhone={formatPhone(customer.phone)}
        initialAddresses={toAddressEntries(customer.addresses)}
        onSave={handleSave}
        loading={loading}
        error={error}
        onCancel={() => router.push('/customers')}
      />
    </div>
  )
}
