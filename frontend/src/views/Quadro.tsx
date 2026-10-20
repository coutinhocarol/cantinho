import { useState } from 'react'
import { useApp } from '../app/context'
import { Flower, IconCheck, IconPlus } from '../components/icons'
import { TaskTags, dueTag, linkChip, notesTag } from '../components/taskParts'
import { QUADS, areaById, areaStatus, taskAreas } from '../lib/areas'
import { isLinked } from '../lib/events'
import type { QuadId, Task } from '../lib/types'

const quadRank = (q: Task['quad']) =>
  q === 'fazer' ? 0 : q === 'delegar' ? 1 : q === 'agendar' ? 2 : q === 'eliminar' ? 3 : 4
const colSort = (x: Task, y: Task) =>
  (x.due || '9').localeCompare(y.due || '9') ||
  quadRank(x.quad) - quadRank(y.quad) ||
  (x.createdAt || 0) - (y.createdAt || 0)

type Drag = { id: string } | null

function QCard({
  t,
  onDragStart,
}: {
  t: Task
  onDragStart: (id: string) => void
}) {
  const c = useApp()
  const a = areaById(c.state, t.areaId)
  const parts = [linkChip(c, t), dueTag(t), notesTag(t)].filter(Boolean)
  const [dragging, setDragging] = useState(false)
  return (
    <div
      className={`qcard${dragging ? ' dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        setDragging(true)
        onDragStart(t.id)
        e.dataTransfer.effectAllowed = 'move'
        try {
          e.dataTransfer.setData('text/plain', t.id)
        } catch {
          /* ignore */
        }
      }}
      onDragEnd={() => setDragging(false)}
    >
      {parts.length ? (
        <span className="task-tags">
          {linkChip(c, t)}
          {dueTag(t)}
          {notesTag(t)}
        </span>
      ) : null}
      <div className="card-row">
        <button
          className="tick"
          onClick={() => c.actions.toggleTask(t.id)}
          aria-label="Concluir tarefa"
        >
          <IconCheck />
        </button>
        <div className="task-body">
          <button
            className="task-title"
            onClick={() => c.openDialog({ kind: 'task', id: t.id })}
          >
            {t.title}
          </button>
          <span className="q-area">{a ? `${a.emoji || ''} ${a.name}` : 'Sem área'}</span>
        </div>
      </div>
    </div>
  )
}

function Matriz() {
  const c = useApp()
  const { state, commit, openDialog } = c
  const [drag, setDrag] = useState<Drag>(null)
  const [over, setOver] = useState<string | null>(null)
  const all = [...state.tasks].sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0))
  const free = all.filter((t) => !t.quad)

  const zoneProps = (zone: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!drag) return
      e.preventDefault()
      setOver(zone)
    },
    onDrop: (e: React.DragEvent) => {
      if (!drag) return
      e.preventDefault()
      const id = drag.id
      setDrag(null)
      setOver(null)
      const t = state.tasks.find((x) => x.id === id)
      if (!t) return
      if ((t.quad || '') !== zone) {
        commit((d) => {
          d.tasks.find((x) => x.id === id)!.quad = zone as QuadId | ''
        })
        if (zone === 'agendar' && !isLinked(c.store.getState(), t)) {
          openDialog({ kind: 'schedule', taskId: id })
        }
      }
    },
  })
  const endDrag = () => {
    setDrag(null)
    setOver(null)
  }

  const quad = (q: (typeof QUADS)[number]) => {
    const list = all.filter((t) => t.quad === q.id)
    return (
      <div
        className={`quad q-${q.id}${over === q.id ? ' drop' : ''}`}
        data-q={q.id}
        {...zoneProps(q.id)}
        onDragEnd={endDrag}
      >
        <div className="q-head">
          <span className="q-n">{q.n}</span>
          <div>
            <b>{q.title}</b>
            <span className="q-sub">{q.sub}</span>
          </div>
        </div>
        {list.length ? (
          <div className="q-list">
            {list.map((t) => (
              <QCard key={t.id} t={t} onDragStart={(id) => setDrag({ id })} />
            ))}
          </div>
        ) : (
          <p className="q-empty">Nenhuma tarefa</p>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="sub tw:mt-0 tw:mb-[14px] tw:text-[14px]">
        Arraste uma tarefa para o quadrante desejado, ou mude o quadrante ao editar a tarefa.
      </p>
    <div className="mwrap">
      <aside
        className={`tray${over === '' ? ' drop' : ''}`}
        data-q=""
        {...zoneProps('')}
        onDragEnd={endDrag}
      >
        <h2>Sem classificação</h2>
        {free.length ? (
          <div className="q-list">
            {free.map((t) => (
              <QCard key={t.id} t={t} onDragStart={(id) => setDrag({ id })} />
            ))}
          </div>
        ) : (
          <p className="sub tw:text-[14px]">
            {all.length
              ? 'Todas as tarefas já estão na matriz de priorização.'
              : 'Crie tarefas em Nova tarefa e organize aqui.'}
          </p>
        )}
      </aside>
      <div className="mx">
        <div className="mx-corner"></div>
        <div className="mx-col">Urgente</div>
        <div className="mx-col">Não urgente</div>
        <div className="mx-row">Importante</div>
        {quad(QUADS[0])}
        {quad(QUADS[1])}
        <div className="mx-row">Não importante</div>
        {quad(QUADS[2])}
        {quad(QUADS[3])}
      </div>
    </div>
    </>
  )
}

function Board() {
  const c = useApp()
  const { state, commit } = c
  const areas = taskAreas(state)
  const now = Date.now()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const endDrag = () => {
    setDragId(null)
    setOverCol(null)
  }
  // tarefas cuja área foi excluída continuam existindo, numa coluna "Sem área"
  const orphan = state.tasks.some((t) => !areaById(state, t.areaId))
  const cols = [
    ...areas.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji || '', st: areaStatus(a, now) })),
    ...(orphan ? [{ id: '', name: 'Sem área', emoji: '', st: null }] : []),
  ]
  const inCol = (t: Task, id: string) => (id ? t.areaId === id : !areaById(state, t.areaId))

  return (
    <div className="board">
      {cols.map((col) => {
        const open = state.tasks.filter((t) => inCol(t, col.id)).sort(colSort)
        return (
          <div
            key={col.id || 'sem-area'}
            className={`col${overCol === col.id ? ' drop' : ''}`}
            data-col={col.id}
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              const from = state.tasks.find((t) => t.id === dragId)
              setOverCol(from && inCol(from, col.id) ? null : col.id)
            }}
            onDrop={(e) => {
              if (!dragId) return
              e.preventDefault()
              const id = dragId
              endDrag()
              const t = state.tasks.find((x) => x.id === id)
              if (!t || inCol(t, col.id)) return
              commit((d) => {
                d.tasks.find((x) => x.id === id)!.areaId = col.id
              })
            }}
          >
            <div className="col-head">
              {col.st ? <span className="tw:text-[18px]">{col.emoji}</span> : null}
              <b>{col.name}</b>
              {col.st ? (
                col.st.due ? (
                  <span className="chip rose">A checar</span>
                ) : (
                  <span className="chip green">Em dia</span>
                )
              ) : null}
            </div>
            <div className="col-list">
              {open.length || col.st?.due ? (
                open.map((t) => (
                  <div
                    key={t.id}
                    className={`card ${dragId === t.id ? 'dragging' : ''}`}
                    draggable
                    data-task={t.id}
                    onDragStart={(e) => {
                      setDragId(t.id)
                      e.dataTransfer.effectAllowed = 'move'
                      try {
                        e.dataTransfer.setData('text/plain', t.id)
                      } catch {
                        /* ignore */
                      }
                    }}
                    onDragEnd={endDrag}
                  >
                    <TaskTags c={c} t={t} />
                    <div className="card-row">
                      <button
                        className="tick"
                        onClick={() => c.actions.toggleTask(t.id)}
                        aria-label="Concluir tarefa"
                      >
                        <IconCheck />
                      </button>
                      <div className="task-body">
                        <button
                          className="task-title"
                          onClick={() => c.openDialog({ kind: 'task', id: t.id })}
                        >
                          {t.title}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-ok">
                  <Flower className="flower sm g" />
                  <b>Tudo tranquilo por aqui</b>
                  <span>Nada pra fazer nessa área agora. Pode respirar fundo.</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Quadro() {
  const { state, ui, setUi, setTab, openDialog } = useApp()
  const areas = taskAreas(state)
  const hasOrphans = state.tasks.some((t) => !areaById(state, t.areaId))
  const mat = ui.tview === 'matriz'
  const setView = (v: 'area' | 'matriz') => {
    setUi({ tview: v })
    try {
      localStorage.setItem('cantinho-tview', v)
    } catch {
      /* sem armazenamento */
    }
  }
  return (
    <>
      <div className="board-head">
        <div>
          <h1>Tarefas</h1>
        </div>
        {areas.length ? (
          <button className="btn primary" onClick={() => openDialog({ kind: 'task', id: null })}>
            <IconPlus />
            Nova tarefa
          </button>
        ) : null}
      </div>
      {areas.length || hasOrphans ? (
        <div className="tview">
          <div className="seg inl">
            <button type="button" aria-pressed={!mat} onClick={() => setView('area')}>
              Por área
            </button>
            <button type="button" aria-pressed={mat} onClick={() => setView('matriz')}>
              Matriz de priorização
            </button>
          </div>
        </div>
      ) : null}
      {!areas.length && !hasOrphans ? (
        <div className="empty">
          <Flower />
          {state.areas.length ? (
            <>
              <strong>Nenhuma área aceita tarefas</strong>
              <p>
                Ao editar uma área, ligue a opção Aceita tarefas para ela virar uma coluna aqui.
              </p>
            </>
          ) : (
            <>
              <strong>As tarefas aparecem quando houver áreas</strong>
              <p>Cada área cadastrada vira uma coluna aqui.</p>
            </>
          )}
          <button className="btn primary" onClick={() => setTab('areas')}>
            Ir para Áreas
          </button>
        </div>
      ) : mat ? (
        <Matriz />
      ) : (
        <Board />
      )}
    </>
  )
}
