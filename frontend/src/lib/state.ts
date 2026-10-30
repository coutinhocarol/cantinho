import type { AppState, ListId, Period } from './types'
import { pruneEvents, eventById } from './events'

const LIST_IDS: ListId[] = ['indicacoes', 'hobbies', 'compras']

export const emptyState = (): AppState => ({
  v: 1,
  areas: [],
  tasks: [],
  events: [],
  lists: { indicacoes: [], hobbies: [], compras: [] },
  notes: [],
  missed: [],
  reprioDate: '',
})

/**
 * Corrige dados antigos/inconsistentes e faz a "virada do dia".
 * Muta o estado recebido e devolve `true` se algo mudou.
 */
export function normalize(s: AppState, now = new Date()): boolean {
  let ch = false
  if (!Array.isArray(s.events)) s.events = []
  if (!s.lists || typeof s.lists !== 'object') s.lists = {} as AppState['lists']
  LIST_IDS.forEach((k) => {
    if (!Array.isArray(s.lists[k])) s.lists[k] = []
  })
  if (!Array.isArray(s.notes)) s.notes = []
  if (!Array.isArray(s.missed)) s.missed = []
  if (typeof s.reprioDate !== 'string') s.reprioDate = ''
  const before = s.events.length
  s.events = s.events.filter(
    (e) => !((!e.repeat || e.repeat === 'none') && (e.doneDates || []).includes(e.date)),
  )
  if (s.events.length !== before) ch = true
  if (pruneEvents(s, now)) ch = true
  ;(s.tasks || []).forEach((t) => {
    if (t.eventId && !eventById(s, t.eventId)) {
      delete t.eventId
      ch = true
    }
  })
  s.areas.forEach((a) => {
    if (!Array.isArray(a.routines)) {
      // áreas antigas tinham uma única periodicidade, guardada na própria área
      const old = a as unknown as Record<string, any>
      a.routines = [
        {
          id: a.id,
          name: '',
          period: old.period ?? { type: 'interval', every: 7, unit: 'days' },
          lastDone: old.lastDone ?? null,
          history: old.history ?? [],
          createdAt: old.createdAt ?? Date.now(),
          ...(old.forceDue ? { forceDue: old.forceDue } : {}),
        },
      ]
      for (const k of ['period', 'lastDone', 'history', 'forceDue']) delete old[k]
      ch = true
    }
    a.routines.forEach((r) => {
      // dados antigos podem ter períodos que já não existem
      const p = (r.period || {}) as unknown as Record<string, unknown>
      if (p.type === 'monthly') {
        r.period = { type: 'interval', every: 30, unit: 'days' }
        ch = true
      } else if (p.type === 'interval' && p.unit !== 'days') {
        const every = Number(p.every)
        const d = p.unit === 'weeks' ? 7 * every : Math.ceil(every / 24)
        r.period = { type: 'interval', every: Math.max(1, d), unit: 'days' } as Period
        ch = true
      }
    })
  })
  return ch
}

export const hasData = (st: AppState | null | undefined): boolean =>
  !!st &&
  !!(
    (st.areas || []).length ||
    (st.tasks || []).length ||
    (st.events || []).length ||
    (st.notes || []).length ||
    Object.values(st.lists || {}).some((a) => (a || []).length)
  )

/** Junta o que existia só neste aparelho com o que já está na conta. */
export function mergeLocalInto(remote: AppState, local: AppState): AppState {
  const out: AppState = JSON.parse(JSON.stringify(remote))
  const ids = (a: { id: string }[] | undefined) => new Set((a || []).map((x) => x.id))
  for (const k of ['areas', 'tasks', 'events'] as const) {
    const arr = (out[k] ?? []) as { id: string }[]
    Object.assign(out, { [k]: arr })
    const have = ids(arr)
    ;((local[k] || []) as { id: string }[]).forEach((x) => {
      if (!have.has(x.id)) arr.push(x)
    })
  }
  out.notes = out.notes || []
  const haveNotes = ids(out.notes)
  ;(local.notes || []).forEach((x) => {
    if (!haveNotes.has(x.id)) out.notes.push(x)
  })
  out.missed = out.missed || []
  const haveMissed = ids(out.missed)
  ;(local.missed || []).forEach((x) => {
    if (!haveMissed.has(x.id)) out.missed.push(x)
  })
  out.reprioDate = (local.reprioDate || '') > (out.reprioDate || '') ? local.reprioDate : out.reprioDate || ''
  out.lists = out.lists || ({} as AppState['lists'])
  LIST_IDS.forEach((k) => {
    out.lists[k] = out.lists[k] || []
    const have = ids(out.lists[k])
    ;((local.lists || {})[k] || []).forEach((x) => {
      if (!have.has(x.id)) out.lists[k].push(x)
    })
  })
  return out
}
