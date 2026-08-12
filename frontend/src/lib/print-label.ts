import { formatPhone } from './phone'

// Formato da etiqueta configurado na loja (GET /store/settings → labelFormat).
export type LabelFormat = 'a4' | 'thermal80' | 'thermal58'

export interface LabelData {
  orderCode:      string   // já formatado (ex.: "A1B2C3D4")
  createdAt:      string   // ISO
  customerName:   string
  phone:          string   // telefone bruto (será formatado)
  address:        string
  complement?:    string | null
  assistanceName?: string | null
}

// Escapa texto do usuário para não quebrar o HTML da etiqueta.
function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Dimensões e escala de fonte por formato. Tudo em preto & branco.
const FORMAT_STYLES: Record<LabelFormat, { page: string; body: string; name: string; text: string; small: string; card: string }> = {
  a4: {
    page:  '@page { size: A4; margin: 0 }',
    body:  'padding: 20mm; display: flex; justify-content: center;',
    card:  'width: 120mm; border: 2px solid #000; border-radius: 4mm; padding: 10mm;',
    name:  'font-size: 26pt;',
    text:  'font-size: 15pt;',
    small: 'font-size: 11pt;',
  },
  thermal80: {
    page:  '@page { size: 80mm auto; margin: 4mm }',
    body:  '',
    card:  'width: 100%;',
    name:  'font-size: 17pt;',
    text:  'font-size: 12pt;',
    small: 'font-size: 9pt;',
  },
  thermal58: {
    page:  '@page { size: 58mm auto; margin: 3mm }',
    body:  '',
    card:  'width: 100%;',
    name:  'font-size: 13pt;',
    text:  'font-size: 10pt;',
    small: 'font-size: 8pt;',
  },
}

export function buildLabelHtml(data: LabelData, format: LabelFormat): string {
  const s = FORMAT_STYLES[format]

  const assistanceLine = data.assistanceName
    ? `<div class="assistance">${esc(data.assistanceName)}</div>`
    : ''
  const complementLine = data.complement
    ? `<div class="text">${esc(data.complement)}</div>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta ${esc(data.orderCode)}</title>
<style>
  ${s.page}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: Arial, Helvetica, sans-serif; ${s.body} }
  .card { ${s.card} }
  .assistance { ${s.text} font-weight: 700; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid #000; padding-bottom: 2mm; margin-bottom: 3mm; }
  .name { ${s.name} font-weight: 800; line-height: 1.15; margin-bottom: 2mm; word-break: break-word; }
  .text { ${s.text} line-height: 1.3; word-break: break-word; }
  .phone { ${s.small} margin-top: 2mm; }
  .footer { ${s.small} margin-top: 3mm; padding-top: 2mm; border-top: 1px solid #000; display: flex; justify-content: space-between; gap: 4mm; }
  .footer .code { font-weight: 700; }
</style>
</head>
<body>
  <div class="card">
    ${assistanceLine}
    <div class="name">${esc(data.customerName)}</div>
    <div class="text">${esc(data.address)}</div>
    ${complementLine}
    <div class="phone">☎ ${esc(formatPhone(data.phone))}</div>
    <div class="footer">
      <span class="code">#${esc(data.orderCode)}</span>
      <span>${esc(formatCreatedAt(data.createdAt))}</span>
    </div>
  </div>
</body>
</html>`
}

/**
 * Abre uma janela isolada com a etiqueta e dispara a impressão.
 * Deve ser chamada a partir de um clique do usuário (evita bloqueio de popup).
 */
export function printOrderLabel(data: LabelData, format: LabelFormat): void {
  const html = buildLabelHtml(data, format)
  const win = window.open('', '_blank', 'width=420,height=640')
  if (!win) {
    alert('Não foi possível abrir a janela de impressão. Verifique o bloqueador de popups.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()

  const triggerPrint = () => {
    win.focus()
    win.print()
    // Fecha após a impressão (ou cancelamento) do diálogo.
    win.onafterprint = () => win.close()
  }

  // Aguarda o load para garantir que o @page foi aplicado antes de imprimir.
  if (win.document.readyState === 'complete') {
    setTimeout(triggerPrint, 100)
  } else {
    win.onload = () => setTimeout(triggerPrint, 100)
  }
}
