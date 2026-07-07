'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, QrCode, Copy } from 'lucide-react'
import { api } from '@/lib/api'
import { WarrantyListItem } from '@/types'

interface Props {
  id: string
  onClose: () => void
}

export function DetailDrawer({ id, onClose }: Props) {
  const [data, setData] = useState<WarrantyListItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<WarrantyListItem>(`/garantias/${id}`)
      .then(setData)
      .finally(() => setLoading(false))
  }, [id])

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md translate-x-0 bg-white shadow-xl transition-transform duration-200">
        <div className="flex h-16 items-center justify-between border-b border-gray-200 px-5">
          <h2 className="font-semibold text-gray-900">Detalhes da Garantia</h2>
          <button
            onClick={onClose}
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
              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Status</p>
                <span
                  className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    data.status === 'confirmed'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-yellow-50 text-yellow-700'
                  }`}
                >
                  {data.status === 'confirmed' ? 'Confirmado' : 'Pendente'}
                </span>
              </div>

              {/* Customer */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
                <p className="mt-1 font-medium text-gray-900">{data.customerName}</p>
              </div>

              {/* Parts */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Peças</p>
                <ul className="mt-1 list-inside list-disc text-sm text-gray-700">
                  {data.parts.map((part, i) => (
                    <li key={i}>{part}</li>
                  ))}
                </ul>
              </div>

              {/* Sale Date */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Data da Venda</p>
                <p className="mt-1 text-sm text-gray-900">
                  {new Date(data.saleAt).toLocaleString('pt-BR')}
                </p>
              </div>

              {/* Created by / Created at */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Criado por</p>
                <p className="mt-1 text-sm text-gray-700">{data.createdByName ?? '—'}</p>
                <p className="text-xs text-gray-400">
                  {new Date(data.createdAt).toLocaleString('pt-BR')}
                </p>
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
                        const res = await api.get<{ qrDataUrl: string }>(`/garantias/${data.id}/qrcode`)
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

              {/* Questions & Answers (only when confirmed) */}
              {data.status === 'confirmed' && data.answers && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Declarações
                  </p>
                  <div className="space-y-2">
                    {data.answers.map((a) => (
                      <div
                        key={a.questionId}
                        className="flex items-start gap-2 rounded-lg bg-gray-50 p-3"
                      >
                        <span className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                          a.answer ? 'border-green-500 bg-green-50' : 'border-gray-300'
                        }`}>
                          {a.answer && (
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                          )}
                        </span>
                        <p className="text-sm text-gray-700">{a.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Signature */}
              {data.signaturePath && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Rubrica
                  </p>
                  <img
                    src={data.signaturePath}
                    alt="Rubrica"
                    className="max-h-32 rounded-lg border border-gray-200 bg-white p-2"
                  />
                </div>
              )}

              {/* IP / User-Agent / Confirmed At */}
              {data.status === 'confirmed' && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">IP da Resposta</p>
                    <p className="mt-1 text-sm font-mono text-gray-700">{data.responseIp ?? '—'}</p>
                  </div>
                  {data.responseUserAgent && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">User-Agent</p>
                      <p className="mt-1 text-xs text-gray-500 break-all">{data.responseUserAgent}</p>
                    </div>
                  )}
                  {data.confirmedAt && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Confirmado em</p>
                      <p className="mt-1 text-sm text-gray-900">
                        {new Date(data.confirmedAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
