import type { AppState, Task } from './types'
import { isLinked } from './events'
import { parseYmd, ymd } from './time'

export type DueStatus = 'late' | 'today' | 'soon' | null

/** Prazo vencido, de hoje ou dos próximos dois dias (amanhã e depois de amanhã). */
export function dueStatus(t: Pick<Task, 'due'>, now = new Date()): DueStatus {
  if (!t.due) return null
  const today = ymd(now)
  if (t.due < today) return 'late'
  if (t.due === today) return 'today'
  const limit = parseYmd(today)
  limit.setDate(limit.getDate() + 2)
  return t.due <= ymd(limit) ? 'soon' : null
}

/** Pede alerta visual: prazo vencido ou de hoje. */
export const isDueAlert = (t: Pick<Task, 'due'>, now = new Date()) => {
  const d = dueStatus(t, now)
  return d === 'late' || d === 'today'
}

/** Tarefas em aberto que entram em "Tarefas pendentes" na Bora. */
export function pendingTasks(s: AppState, now = new Date()): Task[] {
  return s.tasks.filter(
    (t) => (t.quad === 'fazer' || t.quad === 'delegar' || dueStatus(t, now) !== null),
  )
}

/** Tarefas em aberto que entram em "Tarefas a organizar" (as que já são pendentes ficam de fora). */
export function organizeTasks(s: AppState, now = new Date()): Task[] {
  const pend = new Set(pendingTasks(s, now).map((t) => t.id))
  return s.tasks.filter(
    (t) => !pend.has(t.id) && (!t.quad || (t.quad === 'agendar' && !isLinked(s, t))),
  )
}
