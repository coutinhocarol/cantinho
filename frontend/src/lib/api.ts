import { failureFromResponse, networkFailure } from './failure'
import type { AppState } from './types'

/** Contrato com a API (`/api/state`). */
export interface StateApi {
  /** Estado salvo na conta, ou `null` se ainda não existe. */
  load(): Promise<AppState | null>
  save(state: AppState): Promise<void>
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function createHttpApi(base = '/api', onUnauthorized?: () => void): StateApi {
  /** Faz a requisição e transforma falhas em erros com mensagem clara (limite, banco fora, rede). */
  async function call(path: string, init?: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await fetch(`${base}${path}`, init)
    } catch {
      throw networkFailure()
    }
    if (res.status === 401) onUnauthorized?.()
    if (!res.ok && res.status !== 401) {
      const failure = await failureFromResponse(res)
      if (failure) throw failure
    }
    return res
  }
  return {
    async load() {
      const res = await call('/state', { headers: { Accept: 'application/json' } })
      if (res.status === 204 || res.status === 404) return null
      if (!res.ok) throw new HttpError(res.status, `GET /state falhou (${res.status})`)
      return (await res.json()) as AppState
    },
    async save(state) {
      const res = await call('/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      if (!res.ok) throw new HttpError(res.status, `PUT /state falhou (${res.status})`)
    },
  }
}
