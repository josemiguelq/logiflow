// Máscara e validação de CPF/CNPJ.

export const stripDocument = (v: string): string => (v ?? '').replace(/\D/g, '')

// Aplica a máscara conforme o nº de dígitos (CPF até 11, CNPJ a partir daí).
export function maskDocument(v: string): string {
  const d = stripDocument(v).slice(0, 14)
  if (d.length <= 11) {
    let r = d.slice(0, 3)
    if (d.length > 3) r += '.' + d.slice(3, 6)
    if (d.length > 6) r += '.' + d.slice(6, 9)
    if (d.length > 9) r += '-' + d.slice(9, 11)
    return r
  }
  let r = d.slice(0, 2)
  if (d.length > 2)  r += '.' + d.slice(2, 5)
  if (d.length > 5)  r += '.' + d.slice(5, 8)
  if (d.length > 8)  r += '/' + d.slice(8, 12)
  if (d.length > 12) r += '-' + d.slice(12, 14)
  return r
}

function isValidCpf(value: string): boolean {
  const cpf = stripDocument(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const calc = (len: number) => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

function isValidCnpj(value: string): boolean {
  const cnpj = stripDocument(value)
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  const calc = (len: number) => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cnpj[i]) * weights[i]!
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

export function isValidDocument(value: string): boolean {
  const d = stripDocument(value)
  return d.length === 11 ? isValidCpf(d) : d.length === 14 ? isValidCnpj(d) : false
}
