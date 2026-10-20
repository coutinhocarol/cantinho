import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StateApi } from './api'
import { emptyState } from './state'
import { LS_KEY, Store, stable } from './store'
import type { AppState, Area } from './types'
import { ymd } from './time'

const NOW = new Date(2026, 9, 21, 12, 0, 0)

const area = (id: string, name = id): Area => ({
  id,
  name,
  emoji: '✨',
  period: { type: 'interval', every: 7, unit: 'days' },
  lastDone: null,
  history: [],
  createdAt: NOW.getTime(),
  order: 0,
})

const today = (s: AppState): AppState => {
  s.water = { goal: 10, date: ymd(NOW), count: 0, v2: true }
  return s
}

function fakeApi(remote: AppState | null = null) {
  const api = {
    remote,
    load: vi.fn(async () => (api.remote ? structuredClone(api.remote) : null)),
    save: vi.fn(async (s: AppState) => {
      api.remote = structuredClone(s)
    }),
  }
  return api satisfies StateApi & { remote: AppState | null }
}

const seedLocal = (s: AppState) => localStorage.setItem(LS_KEY, JSON.stringify(s))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('Store', () => {
  it('carrega o que está salvo no aparelho', () => {
    const s = today(emptyState())
    s.areas = [area('a')]
    seedLocal(s)
    const store = new Store({ api: fakeApi() })
    expect(store.getState().areas.map((a) => a.id)).toEqual(['a'])
  })

  it('ignora dados locais corrompidos', () => {
    localStorage.setItem(LS_KEY, '{nao-e-json')
    const store = new Store({ api: fakeApi() })
    expect(store.getState().areas).toEqual([])
  })

  it('commit grava no aparelho, e avisa quem escuta', () => {
    const store = new Store({ api: fakeApi() })
    const listener = vi.fn()
    store.subscribe(listener)
    store.commit((d) => {
      d.areas.push(area('a'))
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).areas).toHaveLength(1)
  })

  it('não grava na conta antes de conectar', async () => {
    const api = fakeApi()
    const store = new Store({ api })
    store.commit((d) => void d.areas.push(area('a')))
    await vi.advanceTimersByTimeAsync(2000)
    expect(api.save).not.toHaveBeenCalled()
  })

  it('depois de conectar, junta várias mudanças em uma gravação', async () => {
    const api = fakeApi()
    const store = new Store({ api, debounceMs: 500 })
    await store.connect()
    store.commit((d) => void d.areas.push(area('a')))
    store.commit((d) => void d.areas.push(area('b')))
    await vi.advanceTimersByTimeAsync(499)
    expect(api.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.remote!.areas.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('conta vazia + dados no aparelho: envia o que existe aqui', async () => {
    const s = today(emptyState())
    s.areas = [area('a')]
    seedLocal(s)
    const api = fakeApi(null)
    const store = new Store({ api })
    await store.connect()
    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.remote!.areas.map((a) => a.id)).toEqual(['a'])
  })

  it('aparelho vazio: adota o estado da conta', async () => {
    const remote = today(emptyState())
    remote.areas = [area('r')]
    const store = new Store({ api: fakeApi(remote) })
    await store.connect()
    expect(store.getState().areas.map((a) => a.id)).toEqual(['r'])
  })

  it('primeira conexão com dados dos dois lados: junta e envia o resultado', async () => {
    const local = today(emptyState())
    local.areas = [area('l')]
    seedLocal(local)
    const remote = today(emptyState())
    remote.areas = [area('r')]
    const api = fakeApi(remote)
    const store = new Store({ api, debounceMs: 10 })
    await store.connect()
    await vi.advanceTimersByTimeAsync(20)
    expect(store.getState().areas.map((a) => a.id)).toEqual(['r', 'l'])
    expect(api.remote!.areas.map((a) => a.id)).toEqual(['r', 'l'])
  })

  it('depois de sincronizado uma vez, a conta manda (sem juntar de novo)', async () => {
    localStorage.setItem('cantinho-synced-v1', '1')
    const local = today(emptyState())
    local.areas = [area('l')]
    seedLocal(local)
    const remote = today(emptyState())
    remote.areas = [area('r')]
    const store = new Store({ api: fakeApi(remote) })
    await store.connect()
    expect(store.getState().areas.map((a) => a.id)).toEqual(['r'])
  })

  it('pull traz mudanças feitas em outro aparelho', async () => {
    const remote = today(emptyState())
    remote.areas = [area('r')]
    const api = fakeApi(remote)
    const store = new Store({ api })
    await store.connect()
    api.remote!.areas.push(area('outro-aparelho'))
    await store.pull()
    expect(store.getState().areas.map((a) => a.id)).toEqual(['r', 'outro-aparelho'])
  })

  it('pull não atropela uma gravação pendente', async () => {
    const remote = today(emptyState())
    remote.areas = [area('r')]
    const api = fakeApi(remote)
    const store = new Store({ api })
    await store.connect()
    store.commit((d) => void d.areas.push(area('novo')))
    api.remote!.areas = []
    await store.pull()
    expect(store.getState().areas.map((a) => a.id)).toEqual(['r', 'novo'])
  })

  it('falha ao salvar: avisa uma única vez, mantém os dados e tenta de novo', async () => {
    const api = fakeApi()
    const onSyncFail = vi.fn()
    const store = new Store({ api, onSyncFail, debounceMs: 10, retryMs: () => 1000 })
    await store.connect()
    api.save.mockRejectedValueOnce(new Error('rede')).mockRejectedValueOnce(new Error('rede'))
    store.commit((d) => void d.areas.push(area('a')))
    await vi.advanceTimersByTimeAsync(20)
    expect(onSyncFail).toHaveBeenCalledTimes(1)
    expect(store.getState().areas).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1000) // 1ª nova tentativa (falha de novo)
    expect(onSyncFail).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1900) // a espera dobrou: ainda não tentou
    expect(api.remote).toBeNull()
    await vi.advanceTimersByTimeAsync(200)
    expect(api.remote!.areas.map((a) => a.id)).toEqual(['a'])
  })

  it('não consegue conectar: avisa e segue funcionando só neste aparelho', async () => {
    const api = fakeApi()
    api.load.mockRejectedValueOnce(new Error('offline'))
    const onSyncFail = vi.fn()
    const store = new Store({ api, onSyncFail })
    await store.connect()
    expect(onSyncFail).toHaveBeenCalledWith(expect.stringContaining('só neste aparelho'))
    store.commit((d) => void d.areas.push(area('a')))
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.save).not.toHaveBeenCalled()
    // na próxima tentativa conecta de verdade
    await store.pull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(api.remote!.areas.map((a) => a.id)).toEqual(['a'])
  })

  it('refresh só grava quando a data virou', () => {
    const s = emptyState()
    s.water = { goal: 10, date: '2026-10-20', count: 3, v2: true }
    seedLocal(s)
    const store = new Store({ api: fakeApi() })
    // o carregamento já faz a virada do dia
    expect(store.getState().water).toMatchObject({ date: '2026-10-21', count: 0 })
    const listener = vi.fn()
    store.subscribe(listener)
    store.refresh()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('stable', () => {
  it('ignora a ordem das chaves', () => {
    expect(stable({ a: 1, b: { d: 1, c: 2 } })).toBe(stable({ b: { c: 2, d: 1 }, a: 1 }))
  })
  it('respeita a ordem dos arrays', () => {
    expect(stable([1, 2])).not.toBe(stable([2, 1]))
  })
})
