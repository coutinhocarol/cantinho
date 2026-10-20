import type { AppState, CalEvent, Repeat, Task } from './types'
import { DAY, fmtDayMonth, parseYmd, ymd } from './time'

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: 'Não repete',
  daily: 'Todo dia',
  weekly: 'Toda semana',
  monthly: 'Todo mês',
  yearly: 'Todo ano',
}

export function occursOn(e: CalEvent, key: string): boolean {
  if (!e.date || key < e.date) return false
  const rep = e.repeat || 'none'
  if (rep === 'none') return key === e.date
  if (rep === 'daily') return true
  const b = parseYmd(e.origin || e.date)
  const t = parseYmd(key)
  if (rep === 'weekly') return Math.round((t.getTime() - b.getTime()) / DAY) % 7 === 0
  const lastOf = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
  if (rep === 'monthly')
    return t.getDate() === Math.min(b.getDate(), lastOf(t.getFullYear(), t.getMonth()))
  if (rep === 'yearly')
    return (
      t.getMonth() === b.getMonth() &&
      t.getDate() === Math.min(b.getDate(), lastOf(t.getFullYear(), b.getMonth()))
    )
  return false
}

const evSort = (a: CalEvent, b: CalEvent) =>
  (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) ||
  (a.start || '').localeCompare(b.start || '') ||
  String(a.title).localeCompare(String(b.title))

export const eventById = (s: AppState, id: string | undefined) => s.events.find((e) => e.id === id)
export const isEvDone = (e: CalEvent, key: string) => (e.doneDates || []).includes(key)
export const isRepeating = (e: CalEvent) => !!e.repeat && e.repeat !== 'none'
export const eventsOn = (s: AppState, key: string) =>
  (s.events || []).filter((e) => occursOn(e, key) && !isEvDone(e, key)).sort(evSort)

export const evTimeText = (e: CalEvent) =>
  e.allDay ? 'Dia inteiro' : e.start + (e.end ? ` – ${e.end}` : '')

export function fmtEv(e: CalEvent): string {
  return `${fmtDayMonth(parseYmd(e.date))}${e.allDay ? '' : ' ' + e.start} - ${e.title}${
    isRepeating(e) ? ' (repete)' : ''
  }`
}

export const isLinked = (s: AppState, t: Task) => !!t.eventId && !!eventById(s, t.eventId)

/**
 * Recolhe compromissos cujo dia passou sem serem marcados como feitos: o único sai da agenda, o que
 * se repete avança para a próxima ocorrência. Nada some em silêncio: cada dia perdido vira um item
 * em `s.missed`, que fica na Bora até a exclusão ser confirmada.
 */
export function pruneEvents(s: AppState, now = new Date()): boolean {
  const tk = ymd(now)
  let ch = false
  if (!Array.isArray(s.missed)) s.missed = []
  const seen = new Set(s.missed.map((m) => m.id))
  const miss = (e: CalEvent, date: string) => {
    const id = `${e.id}:${date}`
    if (seen.has(id)) return
    seen.add(id)
    s.missed.push({
      id,
      eventId: e.id,
      title: e.title,
      date,
      allDay: !!e.allDay,
      start: e.start || '',
      end: e.end || '',
      repeat: e.repeat || 'none',
      notes: e.notes || '',
      taskIds: (s.tasks || []).filter((t) => t.eventId === e.id).map((t) => t.id),
    })
    ch = true
  }
  s.events = s.events.filter((e) => {
    if (!e.date) {
      ch = true
      return false
    }
    if (!e.origin) e.origin = e.date
    if (!e.repeat || e.repeat === 'none') {
      if (e.date < tk) {
        miss(e, e.date)
        ch = true
        return false
      }
      return true
    }
    if (e.date < tk) {
      const first = parseYmd(e.date)
      for (let i = 0; i <= 400; i++) {
        const k = ymd(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i, 12))
        if (k >= tk) break
        if (occursOn(e, k) && !isEvDone(e, k)) miss(e, k)
      }
      for (let i = 0; i <= 400; i++) {
        const k = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12))
        if (occursOn(e, k)) {
          e.date = k
          ch = true
          break
        }
      }
    }
    const dd = (e.doneDates || []).filter((d) => d >= tk)
    if (dd.length !== (e.doneDates || []).length) {
      e.doneDates = dd
      ch = true
    }
    return true
  })
  return ch
}
