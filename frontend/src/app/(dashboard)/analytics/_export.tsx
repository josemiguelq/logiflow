import { escapeCsv, downloadCsv, downloadBlob, fmtDateBR, fmtDuration, successRate } from './_utils'
import type { KpisResponse, DelivererPerformance, CustomerCount, DateRange } from './_types'

export interface AnalyticsSnapshot {
  range:           DateRange
  compareRange:    DateRange | null
  kpis?:           KpisResponse
  deliverers:      DelivererPerformance[]
  customersTop:    CustomerCount[]
  customersBottom: CustomerCount[]
}

const KPI_LABELS: { key: keyof KpisResponse['current']; label: string }[] = [
  { key: 'orders',           label: 'Pedidos' },
  { key: 'delivered',        label: 'Entregues' },
  { key: 'onRoute',          label: 'Em Rota' },
  { key: 'cancelled',        label: 'Cancelados' },
  { key: 'activeCustomers',  label: 'Clientes Ativos' },
  { key: 'activeDeliverers', label: 'Entregadores Ativos' },
]

function periodLabel(snap: AnalyticsSnapshot): string {
  const base = `${fmtDateBR(snap.range.from)} a ${fmtDateBR(snap.range.to)}`
  return snap.compareRange
    ? `${base} (comparado a ${fmtDateBR(snap.compareRange.from)} a ${fmtDateBR(snap.compareRange.to)})`
    : base
}

function filenameBase(snap: AnalyticsSnapshot): string {
  return `analitico-${snap.range.from}-a-${snap.range.to}`
}

function kpiRows(snap: AnalyticsSnapshot): string[][] {
  return KPI_LABELS.map(({ key, label }) => [
    label,
    String(snap.kpis?.current[key] ?? 0),
    snap.kpis?.compare ? String(snap.kpis.compare[key]) : '',
  ])
}

function delivererRows(snap: AnalyticsSnapshot): string[][] {
  return snap.deliverers.map(d => [
    d.name,
    String(d.delivered),
    fmtDuration(d.avgRouteMin),
    String(d.cancelled),
    `${successRate(d).toFixed(0)}%`,
  ])
}

function customerRows(list: CustomerCount[]): string[][] {
  return list.map(c => [c.name, String(c.count)])
}

export function exportCsv(snap: AnalyticsSnapshot) {
  const lines: string[] = []
  lines.push(`Analítico — ${periodLabel(snap)}`)
  lines.push('')
  lines.push('KPIs')
  lines.push(['Métrica', 'Atual', 'Comparação'].map(escapeCsv).join(','))
  for (const r of kpiRows(snap)) lines.push(r.map(escapeCsv).join(','))
  lines.push('')
  lines.push('Entregadores')
  lines.push(['Nome', 'Entregas', 'Tempo Médio', 'Cancelamentos', 'Taxa de Sucesso'].map(escapeCsv).join(','))
  for (const r of delivererRows(snap)) lines.push(r.map(escapeCsv).join(','))
  lines.push('')
  lines.push('Top Clientes')
  lines.push(['Cliente', 'Pedidos'].map(escapeCsv).join(','))
  for (const r of customerRows(snap.customersTop)) lines.push(r.map(escapeCsv).join(','))
  lines.push('')
  lines.push('Clientes de Menor Volume')
  lines.push(['Cliente', 'Pedidos'].map(escapeCsv).join(','))
  for (const r of customerRows(snap.customersBottom)) lines.push(r.map(escapeCsv).join(','))

  downloadCsv(lines.join('\r\n'), `${filenameBase(snap)}.csv`)
}

export async function exportXlsx(snap: AnalyticsSnapshot) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()

  const kpiSheet = wb.addWorksheet('KPIs')
  kpiSheet.addRow(['Métrica', 'Atual', 'Comparação'])
  for (const r of kpiRows(snap)) kpiSheet.addRow(r)

  const delivererSheet = wb.addWorksheet('Entregadores')
  delivererSheet.addRow(['Nome', 'Entregas', 'Tempo Médio', 'Cancelamentos', 'Taxa de Sucesso'])
  for (const r of delivererRows(snap)) delivererSheet.addRow(r)

  const customerSheet = wb.addWorksheet('Clientes')
  customerSheet.addRow(['Top Clientes', '', 'Clientes de Menor Volume', ''])
  customerSheet.addRow(['Cliente', 'Pedidos', 'Cliente', 'Pedidos'])
  const maxLen = Math.max(snap.customersTop.length, snap.customersBottom.length)
  for (let i = 0; i < maxLen; i++) {
    const top = snap.customersTop[i]
    const bottom = snap.customersBottom[i]
    customerSheet.addRow([top?.name ?? '', top?.count ?? '', bottom?.name ?? '', bottom?.count ?? ''])
  }

  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${filenameBase(snap)}.xlsx`
  )
}

export async function exportPdf(snap: AnalyticsSnapshot) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const autoTable = autoTableModule.default

  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text('Analítico', 14, 16)
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(periodLabel(snap), 14, 22)

  autoTable(doc, {
    startY: 28,
    head: [['Métrica', 'Atual', 'Comparação']],
    body: kpiRows(snap),
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
  })

  let nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  autoTable(doc, {
    startY: nextY,
    head: [['Nome', 'Entregas', 'Tempo Médio', 'Cancelamentos', 'Taxa de Sucesso']],
    body: delivererRows(snap),
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
  })

  nextY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  autoTable(doc, {
    startY: nextY,
    head: [['Top Clientes', 'Pedidos']],
    body: customerRows(snap.customersTop),
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 9 },
  })

  doc.save(`${filenameBase(snap)}.pdf`)
}
