import { failureFromResponse, networkFailure } from './failure'

export interface User {
  id: string
  username: string
}

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Contrato de login com o backend (`/api/auth/*`). A sessão vai num cookie httpOnly. */
export interface AuthApi {
  me(): Promise<User | null>
  login(username: string, password: string): Promise<User>
  register(username: string, password: string): Promise<User>
  logout(): Promise<void>
}

async function readError(res: Response): Promise<Error> {
  const failure = await failureFromResponse(res)
  if (failure) return failure // limite de uso, banco fora do ar, erro do servidor
  let msg = ''
  try {
    const body = await res.json()
    if (typeof body?.detail === 'string') msg = body.detail
  } catch {
    /* sem corpo */
  }
  if (res.status === 422) msg = 'Confira o usuário (3 a 30 letras, números, ponto, hífen ou _) e use uma senha de pelo menos 8 caracteres.'
  return new AuthError(res.status, msg || `Erro ${res.status}`)
}

export function createHttpAuth(base = '/api'): AuthApi {
  const send = async (url: string, init?: RequestInit) => {
    try {
      return await fetch(url, init)
    } catch {
      throw networkFailure()
    }
  }
  const post = (path: string, body?: unknown) =>
    send(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  return {
    async me() {
      const res = await send(`${base}/auth/me`, { headers: { Accept: 'application/json' } })
      if (res.status === 401) return null
      if (!res.ok) throw await readError(res)
      return (await res.json()) as User
    },
    async login(username, password) {
      const res = await post('/auth/login', { username, password })
      if (!res.ok) throw await readError(res)
      return (await res.json()) as User
    },
    async register(username, password) {
      const res = await post('/auth/register', { username, password })
      if (!res.ok) throw await readError(res)
      return (await res.json()) as User
    },
    async logout() {
      await post('/auth/logout')
    },
  }
}
