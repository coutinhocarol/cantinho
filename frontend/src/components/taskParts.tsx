import type { ReactNode } from 'react'
import type { AppCtx } from '../app/context'
import { quadById } from '../lib/areas'
import { eventById } from '../lib/events'
import type { Task } from '../lib/types'
import { fmtDayMonth, parseYmd } from '../lib/time'

type Ctx = Pick<AppCtx, 'state' | 'openDialog'>

/** Etiqueta do quadrante, ou o botão "Sem classificação". */
export function quadTag(c: Ctx, t: Task): ReactNode {
  const q = quadById(t.quad)
  return q ? (
    <span className={`chip qtag q-${q.id}`}>{q.title}</span>
  ) : (
    <button
      type="button"
      className="chip chip-btn warn"
      title="Escolher o quadrante"
      onClick={() => c.openDialog({ kind: 'move', taskId: t.id })}
    >
      Sem classificação
    </button>
  )
}

/** Compromisso ligado à tarefa (ou aviso se está em Agendar sem compromisso). */
export function linkChip(c: Ctx, t: Task): ReactNode | null {
  const e = t.eventId ? eventById(c.state, t.eventId) : null
  if (e) {
    return (
      <button
        type="button"
        className="chip chip-btn"
        title={`Compromisso: ${e.title}. Toque para trocar.`}
        onClick={() => c.openDialog({ kind: 'schedule', taskId: t.id })}
      >
        {`🔗 ${fmtDayMonth(parseYmd(e.date))}${e.allDay ? '' : ' ' + e.start}`}
      </button>
    )
  }
  if (t.quad !== 'agendar') return null
  return (
    <button
      type="button"
      className="chip chip-btn warn"
      title="Ligar a um compromisso do calendário"
      onClick={() => c.openDialog({ kind: 'schedule', taskId: t.id })}
    >
      Sem compromisso
    </button>
  )
}

export function dueTag(t: Task): ReactNode | null {
  if (!t.due) return null
  const d = new Date(t.due + 'T23:59:59').getTime()
  const late = !t.done && d < Date.now()
  const txt = fmtDayMonth(new Date(d))
  return (
    <span className="chip" title={`${late ? 'Atrasada, prazo ' : 'Prazo '}${txt}`}>
      {`⏳ ${txt}`}
    </span>
  )
}

export const notesTag = (t: Task): ReactNode | null =>
  t.notes ? (
    <span className="chip" title="Tem nota">
      📝
    </span>
  ) : null

export function TaskTags({ c, t, noQuad }: { c: Ctx; t: Task; noQuad?: boolean }) {
  return (
    <span className="task-tags">
      {noQuad ? null : quadTag(c, t)}
      {linkChip(c, t)}
      {dueTag(t)}
      {notesTag(t)}
    </span>
  )
}
