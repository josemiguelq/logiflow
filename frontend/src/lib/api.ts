import { forceLogout } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('logiflow_token')
}

function getBrowser(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (ua.includes('Firefox'))  return 'firefox'
  if (ua.includes('Edg'))      return 'edge'
  if (ua.includes('OPR'))      return 'opera'
  if (ua.includes('Chrome'))   return 'chrome'
  if (ua.includes('Safari'))   return 'safari'
  return 'unknown'
}

function getDevice(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (ua.includes('iPhone'))   return 'iphone'
  if (ua.includes('iPad'))     return 'ipad'
  if (ua.includes('Android'))  return 'android'
  if (ua.includes('Mac'))      return 'mac'
  if (ua.includes('Win'))      return 'windows'
  if (ua.includes('Linux'))    return 'linux'
  return 'unknown'
}

function buildCorrelationId(path: string): string {
  const slug = path.replace(/^\//, '').replace(/\//g, '-') || 'root'
  return `webapp-${getBrowser()}-${getDevice()}-${slug}`
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken()
  const correlationId = buildCorrelationId(path)
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'correlation-id': correlationId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!res.ok) {
    // Token invalid/expired — drop the session and redirect to login.
    // Skip auth endpoints so a wrong password on /login doesn't trigger a redirect loop.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      forceLogout()
    }
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error ?? 'Request failed')
  }

  if (res.status === 204) return null as T
  return res.json()
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch:  <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put:    <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete:         <T>(path: string)              => request<T>(path, { method: 'DELETE' }),
  deleteWithBody: <T>(path: string, body: unknown) => request<T>(path, { method: 'DELETE', body: JSON.stringify(body) }),
}
