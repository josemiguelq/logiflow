/** Strip all non-digit characters — use this before sending to the backend */
export function stripPhone(v: string): string {
  return v.replace(/\D/g, '')
}

/** Apply (XX) XXXXX-XXXX mask as the user types */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d.length ? `(${d}` : ''
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/** Format a stored raw phone number for display */
export function formatPhone(raw: string): string {
  return maskPhone(raw)
}
