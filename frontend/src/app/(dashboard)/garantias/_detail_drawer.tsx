'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, QrCode } from 'lucide-react'
import { api } from '@/lib/api'
import { WarrantyClientDetail, WarrantyAcceptance } from '@/types'

interface Props {
  customerId: string
  onClose: () => void
}

function AcceptanceCard({ a, isCurrent }: { a: WarrantyAcceptance; isCurrent: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          Versão v{a.termsVersion}
          {isCurrent && <span className="ml-2 text-xs font-medium text-gray-400">(atual)</span>}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            a.status === 'confirmed' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
          }`}
        >
          {a.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
        </span>
      </div>

      {a.status === 'confirmed' && a.answers && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Declarações</p>
          <div className="space-y-1.5">
            {a.answers.map((ans) => (
              <div key={ans.questionId} className="flex items-start gap-2">
                <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center ${
                  ans.answer ? 'border-green-500 bg-green-50' : 'border-gray-300'
                }`}>
                  {ans.answer && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
                </span>
                <p className="text-xs text-gray-700">{ans.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {a.signaturePath && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Rubrica</p>
          <img src={a.signaturePath} alt="Rubrica" className="max-h-24 rounded-lg border border-gray-200 bg-white p-2" />
        </div>
      )}

      {a.status === 'confirmed' && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {a.confirmedAt && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-400">Confirmado em: </span>
              {new Date(a.confirmedAt).toLocaleString('pt-BR')}
            </p>
          )}
          {a.responseIp && (
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-400">IP: </span>
              <span className="font-mono">{a.responseIp}</span>
            </p>
          )}
          {a.responseUserAgent && (
            <p className="text-xs text-gray-400 break-all">
              <span className="font-medium">User-Agent: </span>{a.responseUserAgent}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function DetailDrawer({ customerId, onClose }: Props) {
  const [data, setData] = useState<WarrantyClientDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<WarrantyClientDetail>(`/garantias/${customerId}`)
      .then(setData)
      .finally(() => setLoading(false))
    requestAnimationFrame(() => setVisible(true))
  }, [customerId])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 200)
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-xl transition-transform duration-200 ${visible ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
          <h2 className="font-semibold text-gray-900">Garantia do Cliente</h2>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100vh-64px)] p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : !data ? (
            <p className="text-sm text-gray-500">Dados não encontrados.</p>
          ) : (
            <div className="space-y-5">
              {/* Customer */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
                <p className="mt-1 font-medium text-gray-900">{data.customerName}</p>
              </div>

              {/* QR Code */}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">QR Code</p>
                {qrDataUrl ? (
                  <div className="space-y-2">
                    <img src={qrDataUrl} alt="QR Code" className="h-32 w-32 rounded-lg border border-gray-200" />
                    <button
                      onClick={() => setQrDataUrl(null)}
                      className="text-xs font-medium hover:underline"
                      style={{ color: 'var(--color-primary)' }}
                    >
                      Esconder QR
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      setQrLoading(true)
                      try {
                        const res = await api.get<{ qrDataUrl: string }>(`/garantias/${customerId}/qrcode`)
                        setQrDataUrl(res.qrDataUrl)
                      } finally {
                        setQrLoading(false)
                      }
                    }}
                    disabled={qrLoading}
                    className="flex items-center gap-1.5 text-xs font-medium hover:underline transition-colors disabled:opacity-40"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    {qrLoading ? 'Carregando…' : 'Exibir QR Code'}
                  </button>
                )}
              </div>

              {/* Acceptance history */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Histórico de aceites
                </p>
                {data.acceptances.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhum aceite registrado ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {data.acceptances.map((a) => (
                      <AcceptanceCard
                        key={a.id}
                        a={a}
                        isCurrent={data.currentVersion === a.termsVersion}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
