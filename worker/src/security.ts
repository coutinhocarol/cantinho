/**
 * Senhas com PBKDF2-SHA256 (WebCrypto, nativo dos Workers) e sessão em JWT HS256.
 * Formato guardado: pbkdf2$sha256$<iterações>$<sal base64>$<hash base64>
 */
import { sign, verify } from 'hono/jwt'

// O runtime dos Workers aceita no máximo 100.000 iterações no PBKDF2.
export const PBKDF2_ITERATIONS = 100_000
const KEY_BYTES = 32

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BYTES * 8,
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, iterations)
  return `pbkdf2$sha256$${iterations}$${b64(salt)}$${b64(hash)}`
}

/** Comparação em tempo constante. Com `hash` nulo (e-mail inexistente) gasta o mesmo tempo e falha. */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  const parts = hash?.split('$') ?? []
  const valid = parts.length === 5 && parts[0] === 'pbkdf2' && parts[1] === 'sha256'
  const iterations = valid ? Number(parts[2]) : PBKDF2_ITERATIONS
  const salt = valid ? unb64(parts[3]) : new Uint8Array(16)
  const expected = valid ? unb64(parts[4]) : new Uint8Array(KEY_BYTES)
  const actual = await derive(password, salt, iterations)
  let diff = actual.length ^ expected.length
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ (expected[i] ?? 0)
  return valid && diff === 0
}

export const COOKIE_NAME = 'cantinho_session'

export function createToken(userId: string, secret: string, days: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + days * 86400
  return sign({ sub: userId, exp }, secret, 'HS256')
}

export async function readToken(token: string, secret: string): Promise<string | null> {
  try {
    const payload = await verify(token, secret, 'HS256')
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
