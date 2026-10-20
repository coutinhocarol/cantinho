import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { QUADS, acceptsTasks, areaById, sortedAreas, taskAreas } from '../lib/areas'
import { eventById, fmtEv, isLinked } from '../lib/events'
import type { QuadId, Task } from '../lib/types'
import { uid, ymd } from '../lib/time'

export function TaskDialog({ id, areaId }: { id: string | null; areaId?: string }) {
  const { state, ui, setUi, commit, store, closeDialog, openDialog, toast } = useApp()
  const src = id ? state.tasks.find((t) => t.id === id) : null
  const titleRef = useRef<HTMLInputElement>(null)

  const defaultArea =
    [areaId, ui.lastArea].find((x) => {
      const a = x ? areaById(state, x) : undefined
      return !!a && acceptsTasks(a)
    }) || taskAreas(state)[0]?.id
  const [title, setTitle] = useState(src?.title ?? '')
  const [area, setArea] = useState(src ? src.areaId : (defaultArea ?? ''))
  const [due, setDue] = useState(src?.due ?? '')
  const [quad, setQuad] = useState<QuadId | ''>(src?.quad ?? '')
  const [ev, setEv] = useState(src && src.eventId && eventById(state, src.eventId) ? src.eventId : '')
  const [notes, setNotes] = useState(src?.notes ?? '')
  const [delArm, setDelArm] = useState(false)
  const [titleBad, setTitleBad] = useState(false)

  useEffect(() => {
    if (src) return
    const t = setTimeout(() => titleRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [src])

  const events = [...state.events].sort((a, b) =>
    (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')),
  )

  const save = () => {
    const ttl = title.trim()
    if (!ttl) {
      titleRef.current?.focus()
      setTitleBad(true)
      return
    }
    const vals = { title: ttl, areaId: area, due: due || '', notes: notes.trim(), quad }
    const wasAg = !!src && src.quad === 'agendar'
    const taskId = src ? src.id : uid()
    commit((d) => {
      let t: Task
      if (src) {
        t = d.tasks.find((x) => x.id === src.id)!
        Object.assign(t, vals)
      } else {
        t = { id: taskId, ...vals, createdAt: Date.now() }
        d.tasks.push(t)
      }
      if (ev !== '__new') {
        if (ev && eventById(d, ev)) t.eventId = ev
        else delete t.eventId
      }
    })
    setUi({ lastArea: vals.areaId })
    const now = store.getState()
    const t = now.tasks.find((x) => x.id === taskId)!
    if (ev === '__new') {
      openDialog({ kind: 'event', id: null, dateKey: ymd(new Date()), opts: { title: t.title, linkTaskId: t.id } })
    } else if (t.quad === 'agendar' && !isLinked(now, t) && !wasAg) {
      openDialog({ kind: 'schedule', taskId: t.id })
    } else {
      closeDialog()
    }
  }

  const remove = () => {
    if (!delArm) {
      setDelArm(true)
      return
    }
    const copy = { ...src! }
    commit((d) => {
      d.tasks = d.tasks.filter((t) => t.id !== src!.id)
    })
    closeDialog()
    toast('Tarefa excluída', () => commit((d) => void d.tasks.push(copy)))
  }

  return (
    <div className="dlg">
      <h2>{src ? 'Editar tarefa' : 'Nova tarefa'}</h2>
      <div>
        <label className="lbl" htmlFor="t-title">
          Tarefa
        </label>
        <input
          className="field"
          id="t-title"
          ref={titleRef}
          value={title}
          style={titleBad ? { borderColor: 'var(--rose)' } : undefined}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Trocar a roupa de cama"
        />
      </div>
      <div className="row tw:items-end">
        <div className="tw:flex-[1_1_180px]">
          <label className="lbl" htmlFor="t-area">
            Área
          </label>
          <select className="field" id="t-area" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Sem área</option>
            {sortedAreas(state)
              .filter((a) => acceptsTasks(a) || a.id === area)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.emoji || ''} ${a.name}`}
                </option>
              ))}
          </select>
        </div>
        <div className="tw:flex-[1_1_150px]">
          <label className="lbl" htmlFor="t-due">
            Prazo (opcional)
          </label>
          <input
            className="field"
            type="date"
            id="t-due"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="t-quad">
          Matriz de priorização
        </label>
        <select
          className="field"
          id="t-quad"
          value={quad}
          onChange={(e) => setQuad(e.target.value as QuadId | '')}
        >
          <option value="">Sem classificação</option>
          {QUADS.map((q) => (
            <option key={q.id} value={q.id}>
              {`${q.title} (${q.sub.toLowerCase()})`}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="lbl" htmlFor="t-ev">
          Compromisso no calendário
        </label>
        <select className="field" id="t-ev" value={ev} onChange={(e) => setEv(e.target.value)}>
          <option value="">Nenhum</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {fmtEv(e)}
            </option>
          ))}
          <option value="__new">+ Criar novo compromisso</option>
        </select>
        <p className="sub tw:mt-[6px] tw:mb-0 tw:text-[13px]" id="t-evhint">
          {quad === 'agendar' ? 'Obrigatório em Agendar: ligue a um compromisso.' : 'Opcional.'}
        </p>
      </div>
      <div>
        <label className="lbl" htmlFor="t-notes">
          Notas
        </label>
        <textarea
          className="field"
          id="t-notes"
          placeholder="Detalhes, links, lembretes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div className="dlg-foot">
        {src ? (
          <button type="button" className="btn danger" data-dact="delete" onClick={remove}>
            {delArm ? 'Toque de novo para excluir' : 'Excluir'}
          </button>
        ) : null}
        <span className="spacer"></span>
        <button type="button" className="btn ghost" data-dact="cancel" onClick={closeDialog}>
          Cancelar
        </button>
        <button type="button" className="btn primary" data-dact="save" onClick={save}>
          {src ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}
