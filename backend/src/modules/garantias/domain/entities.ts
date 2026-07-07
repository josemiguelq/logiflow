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
