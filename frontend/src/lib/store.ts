import type { StateApi } from './api'
import type { AppState } from './types'
import { HttpError } from './api'
import { emptyState, hasData, mergeLocalInto, normalize } from './state'

export const LS_KEY = 'cantinho-em-ordem-v1'
const SYNC_KEY = 'cantinho-synced-v1'
const isUnauthorized = (e: unknown) => e instanceof HttpError && e.status === 401
const SYNC_FAIL_MSG = 'Não consegui salvar na sua conta. Por enquanto seus dados ficam só neste aparelho.'

/** JSON com chaves ordenadas: compara estados sem depender da ordem das chaves. */
export function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  )
}

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sem armazenamento local */
  }
}

export interface StoreOptions {
  api: StateApi
  onSyncFail?: (msg: string) => void
  /** Separa os dados locais de cada usuário (ex.: o id da conta). */
  namespace?: string
  /** Pausa antes de gravar na conta (ms). */
  debounceMs?: number
  /** Espera antes de tentar de novo após uma falha de rede (ms). */
  retryMs?: () => number
}

/**
 * Guarda o estado do app. Toda mudança passa por `commit`, que grava no aparelho,
 * avisa a interface e (com pequeno atraso) envia para a conta no servidor.
 */
export class Store {
  private state: AppState = emptyState()
  private listeners = new Set<() => void>()
  private api: StateApi
  onSyncFail: (msg: string) => void
  private debounceMs: number
  private retryMs: () => number
  private lsKey: string
  private syncKey: string
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private lastSent = ''
  private connected = false
  private connecting = false
  private syncWarned = false

  constructor(opts: StoreOptions) {
    this.api = opts.api
    const ns = opts.namespace ? `:${opts.namespace}` : ''
    this.lsKey = LS_KEY + ns
    this.syncKey = SYNC_KEY + ns
    this.onSyncFail = opts.onSyncFail ?? (() => {})
    this.debounceMs = opts.debounceMs ?? 500
    this.retryMs = opts.retryMs ?? (() => 1500 + Math.random() * 1500)
    this.loadLocal()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }
  getState = () => this.state
  private emit() {
    this.listeners.forEach((fn) => fn())
  }

  /** Aplica uma mudança numa cópia do estado e persiste. */
  commit = (mutate?: (draft: AppState) => void) => {
    const next = structuredClone(this.state)
    mutate?.(next)
    next.tasks = next.tasks.filter((t) => !t.done)
    this.state = next
    this.saveLocal()
    this.emit()
    if (!this.connected) return
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  /** Atualiza contagens de tempo/virada do dia; grava só se algo mudou. */
  refresh = () => {
    const probe = structuredClone(this.state)
    if (normalize(probe)) this.commit((d) => void normalize(d))
    else this.emit()
  }

  // ---------- aparelho ----------
  private loadLocal() {
    try {
      const raw = localStorage.getItem(this.lsKey)
      if (!raw) return
      const s = JSON.parse(raw) as AppState
      if (s && Array.isArray(s.areas)) {
        s.tasks = (s.tasks || []).filter((t) => !t.done)
        this.state = s
        if (normalize(this.state)) this.saveLocal()
      }
    } catch {
      /* dados locais inválidos: começa do zero */
    }
  }
  private saveLocal() {
    safeSet(this.lsKey, JSON.stringify(this.state))
  }
  private wasSynced = () => safeGet(this.syncKey) === '1'
  private markSynced = () => safeSet(this.syncKey, '1')

  /** Apaga a cópia local (ao sair da conta, para não deixar dados no aparelho). */
  clearLocal = () => {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = null
    try {
      localStorage.removeItem(this.lsKey)
      localStorage.removeItem(this.syncKey)
    } catch {
      /* sem armazenamento */
    }
  }

  // ---------- conta (servidor) ----------
  private notifySyncFail() {
    if (this.syncWarned) return
    this.syncWarned = true
    this.onSyncFail(SYNC_FAIL_MSG)
  }

  /** Busca o estado da conta e junta com o que há neste aparelho. */
  connect = async (first = true) => {
    if (this.connecting) return
    this.connecting = true
    try {
      const remote = await this.api.load()
      this.connected = true
      this.applyRemote(remote, first)
    } catch (e) {
      console.error('sync: não conectou', e)
      if (!isUnauthorized(e)) this.notifySyncFail()
    } finally {
      this.connecting = false
    }
  }

  /** Reconsulta a conta (ex.: ao voltar para a aba) se não houver gravação pendente. */
  pull = async () => {
    if (!this.connected) return this.connect(true)
    if (this.writeTimer) return
    try {
      this.applyRemote(await this.api.load(), false)
    } catch (e) {
      console.error('sync: erro na leitura', e)
    }
  }

  private applyRemote(remote: AppState | null, first: boolean) {
    if (!remote) {
      if (first && hasData(this.state)) void this.flush()
      return
    }
    const body = stable(remote)
    if (first && !this.wasSynced() && hasData(this.state) && body !== stable(this.state)) {
      // primeira conexão deste aparelho: junta o que existia aqui com o que está na conta
      const merged = mergeLocalInto(remote, this.state)
      normalize(merged)
      this.markSynced()
      this.state = merged
      this.commit()
      return
    }
    this.markSynced()
    if (this.writeTimer || body === stable(this.state)) {
      this.lastSent = body
      return
    }
    this.state = JSON.parse(JSON.stringify(remote))
    this.lastSent = body
    const nch = normalize(this.state)
    if (this.state.tasks.some((t) => t.done) || nch) {
      this.commit()
      return
    }
    this.saveLocal()
    this.emit()
  }

  flush = async (): Promise<void> => {
    this.writeTimer = null
    const body = stable(this.state)
    if (body === this.lastSent) return
    try {
      await this.api.save(this.state)
      this.lastSent = body
      this.markSynced()
    } catch (e) {
      console.error('sync: falha ao salvar', e)
      if (isUnauthorized(e)) return // sessão expirou: a tela de login assume
      this.notifySyncFail()
      if (!this.writeTimer) this.writeTimer = setTimeout(() => void this.flush(), this.retryMs())
    }
  }
}
