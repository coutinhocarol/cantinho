import type { ReactNode } from 'react'
import type { AppCtx } from '../app/context'
import { quadById } from '../lib/areas'
import { eventById } from '../lib/events'
import { dueStatus } from '../lib/tasks'
import type { Task } from '../lib/types'
import { fmtDayMonth, parseYmd } from '../lib/time'

type Ctx = Pick<AppCtx, 'state' | 'openDialog'>

/** Etiqueta do quadrante, ou o botão "Sem classificação". */
function quadTag(c: Ctx, t: Task): ReactNode {
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

/**
 * Prazo da tarefa. Vencido ou de hoje vira o alerta ⚠️ (o mesmo em qualquer tela onde a tarefa
 * aparece); amanhã e depois de amanhã mantêm a etiqueta comum.
 */
export function dueAlertLabel(t: Task): string | null {
  const st = dueStatus(t)
  if (st === 'late') return `⚠️ Atrasada · ${fmtDayMonth(parseYmd(t.due))}`
  if (st === 'today') return '⚠️ Vence hoje'
  return null
}

export function dueTag(t: Task): ReactNode | null {
  if (!t.due) return null
  const txt = fmtDayMonth(parseYmd(t.due))
  const alert = dueAlertLabel(t)
  if (alert)
    return (
      <span className="chip alert" title={dueStatus(t) === 'late' ? `Atrasada, prazo ${txt}` : 'Prazo hoje'}>
        {alert}
      </span>
    )
  return (
    <span className="chip" title={`Prazo ${txt}`}>
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

/** Tarefas ligadas a um compromisso, com o mesmo alerta de prazo das demais telas. */
export function LinkedTasks({ c, eventId }: { c: Ctx; eventId: string }) {
  const tasks = c.state.tasks.filter((t) => t.eventId === eventId && !t.done)
  if (!tasks.length) return null
  return (
    <span className="linked-tasks">
      {tasks.map((t) => (
        <span className="linked-task" key={t.id}>
          <button
            type="button"
            className="linked-title"
            onClick={() => c.openDialog({ kind: 'task', id: t.id })}
          >
            {`🔗 ${t.title}`}
          </button>
          {dueTag(t)}
        </span>
      ))}
    </span>
  )
}
