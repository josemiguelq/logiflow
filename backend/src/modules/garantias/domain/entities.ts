export interface WarrantyQuestionSet {
  id: string
  storeId: string
  videoUrl: string | null
  questions: { id: string; label: string; required: boolean }[]
  createdBy: string | null
  createdByName: string | null
  updatedBy: string | null
  updatedByName: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WarrantyAnswer {
  questionId: string
  label: string
  answer: boolean
}

export interface WarrantyQuestion {
  id: string
  label: string
  required: boolean
}

// Versão publicada e imutável dos termos (perguntas + vídeo) de uma loja.
export interface WarrantyTermsVersion {
  id: string
  storeId: string
  version: number
  videoUrl: string | null
  questions: WarrantyQuestion[]
  isCurrent: boolean
  publishedBy: string | null
  publishedByName: string | null
  publishedAt: Date
}

// Link estável por cliente (token público reutilizável).
export interface WarrantyClientLink {
  id: string
  storeId: string
  customerId: string
  token: string
  createdBy: string | null
  createdByName: string | null
  createdAt: Date
}

// Aceite de um cliente a uma versão específica dos termos (append-only).
export interface WarrantyAcceptance {
  id: string
  storeId: string
  customerId: string
  customerName: string
  termsVersionId: string
  termsVersion: number
  status: 'pending' | 'confirmed'
  questionsSnapshot: WarrantyQuestion[] | null
  answers: WarrantyAnswer[] | null
  signaturePath: string | null
  responseIp: string | null
  responseUserAgent: string | null
  confirmedAt: Date | null
  createdBy: string | null
  createdByName: string | null
  createdAt: Date
}

// LEGADO: modelo antigo (garantia por array de peças). Mantido apenas para
// leitura de dados históricos migrados; não é mais criado.
export interface Warranty {
  id: string
  storeId: string
  token: string
  customerId: string | null
  customerName: string
  parts: string[]
  saleAt: Date
  status: 'pending' | 'confirmed'
  questionsSnapshot: { id: string; label: string; required: boolean }[] | null
  answers: WarrantyAnswer[] | null
  signaturePath: string | null
  responseIp: string | null
  responseUserAgent: string | null
  confirmedAt: Date | null
  createdBy: string | null
  createdByName: string | null
  createdAt: Date
}
