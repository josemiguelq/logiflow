export interface WarrantyQuestion {
  id: string
  label: string
  required: boolean
  // Caminho relativo (servido pela pasta public do frontend) de uma imagem
  // ilustrativa exibida acima da pergunta. Opcional.
  image?: string
}

export const DEFAULT_WARRANTY_QUESTIONS: WarrantyQuestion[] = [
  {
    id: 'ciente_cuidados',
    label: 'Teste o funcionamento antes de fechar o aparelho',
    required: true,
    image: 'instructions/warranty/v1/test-before-close.png',
  },
  {
    id: 'testar_lacres',
    label: 'Vou testar o produto antes de remover os lacres de segurança.',
    required: true,
    image: 'instructions/warranty/v1/dont-remove-peeling.png',
  },
  {
    id: 'perda_garantia',
    label: 'Entendo que, se eu não seguir as orientações, a garantia poderá não ser aplicada.',
    required: true,
  },
]

export const DEFAULT_VIDEO_URL: string | null = null
