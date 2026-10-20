import type { ReactNode } from 'react'
import { useApp } from '../app/context'
import { Flower, Glass, IconCheck } from '../components/icons'
import { LinkedTasks, TaskTags } from '../components/taskParts'
import { acceptsTasks, areaById, areaStatus, sortedAreas } from '../lib/areas'
import { REPEAT_LABEL, evTimeText, eventsOn, isEvDone } from '../lib/events'
import { waterCount, waterGoal } from '../lib/state'
import { organizeTasks, pendingTasks } from '../lib/tasks'
import type { Area, AreaStatus, MissedEvent, Task } from '../lib/types'
import { capitalize, fmtDayMonth, parseYmd, rel, ymd } from '../lib/time'

function Ring({ a, st }: { a: Area; st: AreaStatus }) {
  const r = 21
  const c = 2 * Math.PI * r
  const p = st.due ? 1 : st.progress
  const col = st.due
    ? 'var(--rose)'
    : p > 0.75
      ? 'color-mix(in srgb,var(--green) 55%,var(--rose))'
      : 'var(--green)'
  return (
    <div className="area-ring" aria-hidden="true">
      <svg viewBox="0 0 52 52">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--track)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={r}
          fill="none"
          stroke={col}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${(c * p).toFixed(1)} ${c.toFixed(1)}`}
        />
      </svg>
      <span className="emo">{a.emoji || '✨'}</span>
    </div>
  )
}

function StatusLine({ a, st }: { a: Area; st: AreaStatus }) {
  if (st.invalid) return <span>Sem dias definidos</span>
  if (st.never) return <span className="late">Ainda não checada</span>
  if (st.due) {
    const r = rel(st.since!)
    return (
      <span className="late">
        Pendente {r.startsWith('há ') ? r : r === 'mês passado' ? 'desde o mês passado' : 'desde ' + r}
      </span>
    )
  }
  return (
    <span>
      Próxima {rel(st.nextAt!)}
      {a.lastDone ? `, checada ${rel(a.lastDone)}` : ''}
    </span>
  )
}

function AreaRow({ a, st }: { a: Area; st: AreaStatus }) {
  const { actions, state, setTab, setUi } = useApp()
  const open = state.tasks.filter((t) => !t.done && t.areaId === a.id).length
  return (
    <div className={`area-row ${st.due ? 'due' : ''}`}>
      <Ring a={a} st={st} />
      <div className="area-txt">
        <b>{a.name}</b>
        <StatusLine a={a} st={st} />
        {acceptsTasks(a) ? (
          <button
            type="button"
            className="area-todo"
            onClick={() => {
              setUi({ tview: 'area' })
              setTab('quadro')
            }}
          >
            {`Checar suas tarefas${open ? ` (${open})` : ''}`}
          </button>
        ) : null}
      </div>
      <button
        className={`check-btn ${st.due ? '' : 'soft'}`}
        onClick={() => actions.markDone(a.id)}
        aria-label={`Checar ${a.name}`}
      >
        <IconCheck />
        <span>Checar</span>
      </button>
    </div>
  )
}

function TaskRow({ t }: { t: Task }) {
  const c = useApp()
  return (
    <div className={`task ${t.done ? 'done' : ''}`}>
      <button
        className="tick"
        onClick={() => c.actions.toggleTask(t.id)}
        aria-label="Concluir tarefa"
      >
        <IconCheck />
      </button>
      <div className="task-body">
        <div className="task-line">
          <button className="task-title" onClick={() => c.openDialog({ kind: 'task', id: t.id })}>
            {t.title}
          </button>
          <TaskTags c={c} t={t} />
        </div>
      </div>
    </div>
  )
}

function MissedRow({ m }: { m: MissedEvent }) {
  const c = useApp()
  const tasks = c.state.tasks.filter((t) => m.taskIds.includes(t.id) && !t.done)
  return (
    <div className="task missed">
      <div className="task-body">
        <div className="task-line">
          <span className="task-title">{m.title}</span>
          <span className="task-tags">
            <span className="chip rose">{`${fmtDayMonth(parseYmd(m.date))}${m.allDay ? '' : ' ' + m.start}`}</span>
            {m.repeat !== 'none' ? <span className="chip">{REPEAT_LABEL[m.repeat]}</span> : null}
          </span>
        </div>
        {tasks.length ? (
          <span className="missed-note">{`Tarefa: ${tasks.map((t) => t.title).join(', ')}`}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn danger missed-btn"
        onClick={() => c.actions.confirmMissed(m.id)}
        aria-label={`Confirmar exclusão de ${m.title}`}
      >
        Confirmar exclusão
      </button>
    </div>
  )
}

function InfoButton({ text }: { text: string }) {
  const { showInfo } = useApp()
  return (
    <button
      type="button"
      className="info-btn"
      aria-label="Regra desta lista"
      onClick={(e) => showInfo(e.currentTarget, text)}
    >
      i
    </button>
  )
}

const Count = ({ n }: { n: number }) => <span className={`count${n ? '' : ' g'}`}>{n}</span>

export function Inicio() {
  const c = useApp()
  const { state, actions, openDialog, setTab, setUi } = c
  const now = Date.now()
  const areas = sortedAreas(state).map((a) => ({ a, st: areaStatus(a, now) }))
  const due = areas.filter((x) => x.st.due).sort((x, y) => (x.st.since || 0) - (y.st.since || 0))
  const pend = pendingTasks(state)
  const org = organizeTasks(state)
  const openCount = state.tasks.filter((t) => !t.done).length
  const byDue = (x: Task, y: Task) => (x.due || '9').localeCompare(y.due || '9')
  const orgOrdered = [
    ...sortedAreas(state).flatMap((a) => org.filter((t) => t.areaId === a.id).sort(byDue)),
    ...org.filter((t) => !areaById(state, t.areaId)).sort(byDue), // tarefas sem área, no fim
  ]
  const orgList = [
    ...orgOrdered.filter((t) => t.quad === 'agendar'),
    ...orgOrdered.filter((t) => !t.quad),
  ]
  const tk = ymd(new Date())
  const evPend = eventsOn(state, tk).filter((e) => !isEvDone(e, tk))
  const missed = [...state.missed].sort((x, y) => x.date.localeCompare(y.date))
  const reprioPending = openCount > 0 && state.reprioDate !== tk
  const today = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const hr = new Date().getHours()
  const hi = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'
  const goal = waterGoal(state)
  const count = waterCount(state)

  let tasksNode: ReactNode
  if (!pend.length) tasksNode = <p className="sub">Nenhuma tarefa pendente.</p>
  else {
    const aPos = Object.fromEntries(sortedAreas(state).map((a, i) => [a.id, i]))
    const qRank = (q: Task['quad']) => (q === 'fazer' ? 0 : q === 'delegar' ? 1 : 2)
    const ordered = [...pend].sort(
      (x, y) =>
        (x.due || '9').localeCompare(y.due || '9') ||
        qRank(x.quad) - qRank(y.quad) ||
        (aPos[x.areaId] ?? 1e9) - (aPos[y.areaId] ?? 1e9) ||
        (x.createdAt || 0) - (y.createdAt || 0),
    )
    tasksNode = (
      <div>
        {ordered.map((t) => (
          <TaskRow key={t.id} t={t} />
        ))}
      </div>
    )
  }

  const allClear =
    state.areas.length > 0 &&
    !evPend.length &&
    !due.length &&
    !pend.length &&
    !org.length &&
    !missed.length &&
    !reprioPending &&
    goal - count <= 0

  const areasNode = !state.areas.length ? (
    <div className="empty">
      <Flower />
      <strong>Nenhuma área ainda</strong>
      <p>
        Áreas são partes da sua rotina que pedem atenção de tempos em tempos, como a limpeza da casa
        a cada 3 dias, a organização financeira a cada 30 dias ou o estudo para uma matéria da
        faculdade toda sexta às 7h.
      </p>
      <button className="btn primary" onClick={actions.addExamples}>
        Usar exemplos
      </button>{' '}
      <button className="btn" onClick={() => openDialog({ kind: 'area', id: null })}>
        Criar área
      </button>
    </div>
  ) : due.length ? (
    due.map((x) => <AreaRow key={x.a.id} a={x.a} st={x.st} />)
  ) : (
    <p className="sub">Todas as áreas estão em dia.</p>
  )

  const evNode = evPend.length ? (
    <div>
      {evPend.map((e) => (
        <div className="task" key={e.id}>
          <button
            className="tick"
            onClick={() => actions.completeEvent(e.id, tk)}
            aria-label="Marcar compromisso como feito"
          >
            <IconCheck />
          </button>
          <div className="task-body">
            <div className="task-line">
              <button
                className="task-title"
                onClick={() => openDialog({ kind: 'event', id: e.id })}
              >
                {e.title}
              </button>
              <span className="task-tags">
                {e.allDay ? null : <span className="chip rose">{evTimeText(e)}</span>}
                {e.repeat && e.repeat !== 'none' ? (
                  <span className="chip">{REPEAT_LABEL[e.repeat]}</span>
                ) : null}
                {e.notes ? (
                  <span className="chip" title="Tem nota">
                    📝
                  </span>
                ) : null}
              </span>
            </div>
            <LinkedTasks c={c} eventId={e.id} />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="sub">Nenhum compromisso para hoje.</p>
  )

  return (
    <>
      <div className="hello">
        <div>
          <p className="sub tw:text-[15px] tw:normal-case">{capitalize(today)}</p>
          <h1>{hi}!</h1>
        </div>
      </div>
      <div className="home-wrap">
        <div className="home-main">
          {allClear ? (
            <div className="empty all-ok">
              <Flower className="flower g" />
              <strong>Tudo certo por hoje</strong>
              <p>Água, compromissos, tarefas e áreas estão em dia.</p>
            </div>
          ) : (
            <div className="home-grid">
              <div>
                <div className="sec-head">
                  <h2>Compromissos de hoje</h2>
                  <Count n={evPend.length} />
                </div>
                {evNode}
              </div>
              <div className="water-sec">
                <div className="sec-head">
                  <h2>Água de hoje</h2>
                  <Count n={goal - count} />
                </div>
                <div className="water">
                  <div className="water-head">
                    <button
                      type="button"
                      className="btn ghost water-goal"
                      onClick={() => openDialog({ kind: 'waterGoal' })}
                    >
                      {`Meta (${(Math.round(goal * 250) / 1000).toLocaleString('pt-BR')} L)`}
                    </button>
                  </div>
                  <div className={`glasses${goal > 12 ? ' many' : ''}`}>
                    {Array.from({ length: goal }, (_, k) => (
                      <button
                        key={k}
                        type="button"
                        className={`glass${k < count ? ' on' : ''}`}
                        aria-pressed={k < count}
                        aria-label={`Copo ${k + 1} de ${goal}`}
                        onClick={() => actions.setWater(k + 1)}
                      >
                        <Glass on={k < count} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {missed.length ? (
                <div className="missed-sec">
                  <div className="sec-head">
                    <h2>Compromissos que ficaram pra trás</h2>
                    <Count n={missed.length} />
                    <InfoButton text="Compromissos cujo dia passou sem serem marcados como feitos. O sistema os tirou do calendário (num compromisso que se repete, só aquele dia; a série continua). Confirme a exclusão de cada um depois de decidir o que fazer: se ainda vale, crie de novo no Calendário." />
                  </div>
                  <div className="missed-list">
                    {missed.map((m) => (
                      <MissedRow key={m.id} m={m} />
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="sec-head">
                  <h2>Áreas a checar</h2>
                  <Count n={due.length} />
                </div>
                {areasNode}
              </div>
              <div className="home-stack">
                <div>
                  <div className="sec-head">
                    <h2>Repriorizar tarefas</h2>
                    <Count n={reprioPending ? 1 : 0} />
                    <InfoButton text="Todo dia, revise a matriz de priorização: o que mudou de quadrante, o que já pode ser eliminado. Marque como feito depois de revisar; amanhã a pendência volta. Só aparece quando há tarefas em aberto." />
                  </div>
                  {!openCount ? (
                    <p className="sub">Nenhuma tarefa para repriorizar.</p>
                  ) : reprioPending ? (
                    <div className="area-row due reprio">
                      <div className="area-txt">
                        <b>Revisar a matriz de priorização</b>
                        <span className="late">Pendente hoje</span>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setUi({ tview: 'matriz' })
                          setTab('quadro')
                        }}
                      >
                        Abrir matriz
                      </button>
                      <button
                        type="button"
                        className="check-btn"
                        onClick={actions.doneReprio}
                        aria-label="Marcar repriorização como feita"
                      >
                        <IconCheck />
                        <span>Feito</span>
                      </button>
                    </div>
                  ) : (
                    <p className="sub">Tarefas repriorizadas hoje.</p>
                  )}
                </div>
                <div>
                  <div className="sec-head">
                    <h2>Tarefas pendentes</h2>
                    <Count n={pend.length} />
                    <InfoButton text="Mostra as tarefas dos quadrantes Fazer e Simplificar e também qualquer tarefa com prazo vencido ou até depois de amanhã, em qualquer quadrante. Prazo vencido ou de hoje ganha o alerta ⚠️. Ordem: pelo prazo (sem prazo por último) e, com o mesmo prazo, Fazer, depois Simplificar, depois os demais quadrantes." />
                  </div>
                  {tasksNode}
                </div>
                <div>
                  <div className="sec-head">
                    <h2>Tarefas a organizar</h2>
                    <Count n={org.length} />
                    <InfoButton text="Mostra as tarefas sem classificação e as do quadrante Agendar que ainda não estão ligadas a um compromisso do calendário (as que já têm prazo próximo vão para Tarefas pendentes)." />
                  </div>
                  {org.length ? (
                    <div>
                      {orgList.map((t) => (
                        <TaskRow key={t.id} t={t} />
                      ))}
                    </div>
                  ) : (
                    <p className="sub">Nada para organizar.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
