export interface WarrantyQuestion {
  id: string
  label: string
  required: boolean
}

export const DEFAULT_WARRANTY_QUESTIONS: WarrantyQuestion[] = [
  {
    id: 'ciente_cuidados',
    label: 'Fui orientado(a) sobre os cuidados necessários com as peças.',
    required: true,
  },
  {
    id: 'testar_lacres',
    label: 'Vou testar o produto antes de remover os lacres de segurança.',
    required: true,
  },
  {
    id: 'perda_garantia',
    label: 'Entendo que, se eu não seguir as orientações, a garantia poderá não ser aplicada.',
    required: true,
  },
]

export const DEFAULT_VIDEO_URL: string | null = null
