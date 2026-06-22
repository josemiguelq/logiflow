import { redis } from './infra/redis'

// Limite de tentativas de senha POR USUÁRIO (complementa o rate limit por IP).
// Sem isto, um atacante com IPs rotativos teria a cota por IP multiplicada
// contra uma única conta. Aqui contamos as falhas por identidade e bloqueamos
// o login dessa conta por uma janela após atingir o limite.
//
// Best-effort/fail-open, igual ao resto do código: se o Redis cair, não
// bloqueamos o login (não derrubamos o produto por causa do cache).

const MAX_ATTEMPTS = 5            // falhas permitidas antes do bloqueio
const WINDOW_SEC   = 15 * 60      // duração do bloqueio / janela de contagem

// scope: 'store' | 'deliverer' | 'super-admin' — separa contadores por tipo
// de login. identity: e-mail/username (ou storeCode:username) normalizado.
const key = (scope: string, identity: string) =>
  `login:fail:${scope}:${identity.trim().toLowerCase()}`

/** true se a conta está bloqueada por excesso de tentativas. */
export async function isLoginLocked(scope: string, identity: string): Promise<boolean> {
  try {
    const count = Number(await redis.get(key(scope, identity))) || 0
    return count >= MAX_ATTEMPTS
  } catch {
    return false // fail-open
  }
}

/** Registra uma tentativa falha; arma o TTL na primeira falha da janela. */
export async function registerLoginFailure(scope: string, identity: string): Promise<void> {
  try {
    const k = key(scope, identity)
    const n = await redis.incr(k)
    if (n === 1) await redis.expire(k, WINDOW_SEC)
  } catch { /* fail-open */ }
}

/** Zera o contador após login bem-sucedido. */
export async function clearLoginFailures(scope: string, identity: string): Promise<void> {
  try {
    await redis.del(key(scope, identity))
  } catch { /* non-fatal */ }
}
