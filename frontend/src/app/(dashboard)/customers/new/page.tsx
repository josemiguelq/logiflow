'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { api } from '@/lib/api'
import { stripPhone } from '@/lib/phone'
import { CustomerForm, AddressEntry, geocodeAddress } from '../_form'

export default function NewCustomerPage() {
  const router = useRouter()
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
            label:      a.label,
            address:    a.address.trim(),
            complement: a.complement.trim() || undefined,
            isDefault:  i === 0,
            lat,
            lng,
          }
        })
      )
      await api.post('/customers', { name, phone: stripPhone(phone), addresses: withCoords })
      router.push('/customers')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
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
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Novo Cliente</h1>
      <CustomerForm
        onSave={handleSave}
        loading={loading}
        error={error}
        onCancel={() => router.push('/customers')}
      />
    </div>
  )
}
