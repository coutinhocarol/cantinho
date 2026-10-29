import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useApp } from '../app/context'
import { Flower, IconCheck, IconGrip, IconPlus, IconSend } from '../components/icons'
import { acceptsTasks, periodText, routineLabel, routineStatus, sortedAreas } from '../lib/areas'
import { fmtWhen, rel } from '../lib/time'

interface DragData {
  id: string
  card: HTMLElement
  grip: HTMLElement
  pid: number
  gx: number
  gy: number
  x: number
  y: number
  raf: number
}

export function Areas() {
  const { state, actions, openDialog, dragging } = useApp()
  const sorted = sortedAreas(state)
  const now = Date.now()
  const pendCount = sorted.flatMap((a) => a.routines).filter((r) => !routineStatus(r, now).due).length

  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragData | null>(null)
  const orderRef = useRef<string[]>([])
  const focusGrip = useRef<string | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const startRef = useRef<(e: PointerEvent, grip: HTMLElement, id: string) => void>(() => {})
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const areas = dragOrder
    ? dragOrder.map((id) => sorted.find((a) => a.id === id)).filter((a) => !!a)
    : sorted

  // O cartão arrastado acompanha o ponteiro: mede onde ele está e compensa com translate.
  const placeDrag = () => {
    const d = drag.current
    if (!d) return
    d.card.style.transform = 'none'
    const r = d.card.getBoundingClientRect()
    d.card.style.transform = `translate(${d.x - d.gx - r.left}px,${d.y - d.gy - r.top}px)`
  }
  useLayoutEffect(() => {
    placeDrag()
  }, [dragOrder])

  useEffect(() => {
    if (focusGrip.current) {
      document.querySelector<HTMLElement>(`[data-grip="${focusGrip.current}"]`)?.focus()
      focusGrip.current = null
    }
  })

  useEffect(() => {
    const updateDrag = () => {
      const d = drag.current
      if (!d) return
      const grid = gridRef.current
      const t = document
        .elementsFromPoint(d.x, d.y)
        .map((el) => el.closest<HTMLElement>('.area-card'))
        .find((c) => c && c !== d.card && c.parentElement === grid)
      if (t) {
        const ids = orderRef.current
        const from = ids.indexOf(d.id)
        const to = ids.indexOf(t.dataset.area!)
        if (from >= 0 && to >= 0 && from !== to) {
          const next = [...ids]
          next.splice(from, 1)
          next.splice(to, 0, d.id)
          orderRef.current = next
          flushSync(() => setDragOrder(next))
        }
      }
      placeDrag()
    }
    const loop = () => {
      const d = drag.current
      if (!d) return
      const h = window.innerHeight
      let dy = 0
      if (d.y < 90) dy = -Math.ceil((90 - d.y) / 5)
      else if (d.y > h - 100) dy = Math.ceil((d.y - (h - 100)) / 5)
      if (dy) {
        window.scrollBy(0, dy)
        updateDrag()
      }
      d.raf = requestAnimationFrame(loop)
    }
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.pid) return
      d.x = e.clientX
      d.y = e.clientY
      updateDrag()
    }
    const end = (e?: PointerEvent) => {
      const d = drag.current
      if (!d || (e && e.pointerId !== d.pid)) return
      drag.current = null
      cancelAnimationFrame(d.raf)
      d.card.style.transform = ''
      document.body.classList.remove('no-sel')
      try {
        d.grip.releasePointerCapture(d.pid)
      } catch {
        /* ignore */
      }
      dragging.current = false
      const ids = orderRef.current
      setDragId(null)
      setDragOrder(null)
      actions.reorderAreas(ids)
    }
    const start = (e: PointerEvent, grip: HTMLElement, id: string) => {
      const card = grip.closest<HTMLElement>('.area-card')
      if (!card) return
      e.preventDefault()
      const r = card.getBoundingClientRect()
      drag.current = {
        id,
        card,
        grip,
        pid: e.pointerId,
        gx: e.clientX - r.left,
        gy: e.clientY - r.top,
        x: e.clientX,
        y: e.clientY,
        raf: 0,
      }
      try {
        grip.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      dragging.current = true
      orderRef.current = sortedAreas(stateRef.current).map((a) => a.id)
      setDragOrder([...orderRef.current])
      setDragId(id)
      document.body.classList.add('no-sel')
      placeDrag()
      drag.current.raf = requestAnimationFrame(loop)
    }
    startRef.current = start
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', end)
    document.addEventListener('pointercancel', end)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', end)
      document.removeEventListener('pointercancel', end)
      if (drag.current) {
        cancelAnimationFrame(drag.current.raf)
        document.body.classList.remove('no-sel')
        dragging.current = false
      }
    }
  }, [actions, dragging])

  const moveByKey = (e: React.KeyboardEvent, id: string) => {
    const k = ({ ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 } as Record<string, number>)[
      e.key
    ]
    if (!k) return
    e.preventDefault()
    const ids = sortedAreas(state).map((a) => a.id)
    const i = ids.indexOf(id)
    const j = i + k
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    focusGrip.current = id
    actions.reorderAreas(ids)
  }

  return (
    <>
      <div className="board-head areas-head">
        <div>
          <h1>Áreas</h1>
        </div>
        {sorted.length ? (
          <button
            type="button"
            className="btn bora bulk"
            disabled={!pendCount}
            onClick={actions.forceAll}
          >
            <IconSend />
            Mandar todas pra checar
          </button>
        ) : null}
        <button className="btn primary" onClick={() => openDialog({ kind: 'area', id: null })}>
          <IconPlus />
          Nova área
        </button>
      </div>
      <div className="areas-wrap">
        <div className="areas-main">
          {!sorted.length ? (
            <div className="empty">
              <Flower />
              <strong>Nenhuma área cadastrada</strong>
              <p>Crie a primeira ou comece com alguns exemplos.</p>
              <button className="btn primary" onClick={actions.addExamples}>
                Usar exemplos
              </button>
            </div>
          ) : (
            <div className="areas-grid" ref={gridRef}>
              {areas.map((a) => {
                const multi = a.routines.length > 1
                const n = state.tasks.filter((t) => t.areaId === a.id).length
                return (
                  <div
                    className={`area-card${dragId === a.id ? ' dragging' : ''}`}
                    data-area={a.id}
                    key={a.id}
                  >
                    <div className="area-card-top">
                      <span className="big-emo">{a.emoji || '✨'}</span>
                      <div className="tw:min-w-0">
                        <b>{a.name}</b>
                        {multi ? null : <span className="per">{periodText(a.routines[0]?.period)}</span>}
                      </div>
                      <button
                        type="button"
                        className="grip"
                        data-grip={a.id}
                        aria-label={`Reordenar ${a.name}. Arraste ou use as setas do teclado.`}
                        title="Arraste para reordenar"
                        onPointerDown={(e) => {
                          if (e.pointerType === 'mouse' && e.button !== 0) return
                          startRef.current(e.nativeEvent, e.currentTarget, a.id)
                        }}
                        onContextMenu={(e) => e.preventDefault()}
                        onKeyDown={(e) => moveByKey(e, a.id)}
                      >
                        <IconGrip />
                      </button>
                    </div>
                    {a.routines.map((r) => {
                      const st = routineStatus(r, now)
                      return (
                        <div className="routine" key={r.id}>
                          {multi ? (
                            <div className="routine-head">
                              <b>{r.name}</b>
                              <span className="per">{periodText(r.period)}</span>
                            </div>
                          ) : null}
                          <dl>
                            <dt>Situação</dt>
                            <dd>
                              {st.due ? (
                                <span className="chip rose">A checar</span>
                              ) : (
                                <span className="chip green">Em dia</span>
                              )}
                            </dd>
                            <dt>Última checagem</dt>
                            <dd title={r.lastDone ? fmtWhen(r.lastDone) : undefined}>
                              {r.lastDone ? rel(r.lastDone) : 'ainda não checada'}
                            </dd>
                            {st.due ? (
                              <>
                                <dt>Pendente desde</dt>
                                <dd title={st.since ? fmtWhen(st.since) : undefined}>
                                  {st.since ? rel(st.since) : 'o início'}
                                </dd>
                              </>
                            ) : (
                              <>
                                <dt>Fica pendente</dt>
                                <dd title={st.nextAt ? fmtWhen(st.nextAt) : undefined}>
                                  {st.nextAt ? rel(st.nextAt) : '—'}
                                </dd>
                              </>
                            )}
                          </dl>
                          <div className="acts">
                            {st.due ? (
                              <button
                                className="check-btn wide"
                                aria-label={`Checar ${routineLabel(a, r)}`}
                                onClick={() => actions.markDone(a.id, r.id)}
                              >
                                <IconCheck />
                                <span>Checar</span>
                              </button>
                            ) : (
                              <button className="btn bora" onClick={() => actions.forceDue(a.id, r.id)}>
                                <IconSend />
                                Mandar pra checar
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <dl>
                      <dt>Tarefas</dt>
                      <dd>{acceptsTasks(a) ? `${n}` : 'Não aceita tarefas'}</dd>
                    </dl>
                    <div className="acts">
                      <button className="btn" onClick={() => openDialog({ kind: 'area', id: a.id })}>
                        Editar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
