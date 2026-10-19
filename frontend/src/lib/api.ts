import type { AppState } from './types'

/** Contrato com o backend FastAPI (`/api/state`). */
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
  const check = (res: Response) => {
    if (res.status === 401) onUnauthorized?.()
  }
  return {
    async load() {
      const res = await fetch(`${base}/state`, { headers: { Accept: 'application/json' } })
      check(res)
      if (res.status === 204 || res.status === 404) return null
      if (!res.ok) throw new HttpError(res.status, `GET /state falhou (${res.status})`)
      return (await res.json()) as AppState
    },
    async save(state) {
      const res = await fetch(`${base}/state`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      check(res)
      if (!res.ok) throw new HttpError(res.status, `PUT /state falhou (${res.status})`)
    },
  }
}
