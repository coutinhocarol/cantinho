import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { REPEAT_LABEL, eventById, isRepeating } from '../lib/events'
import type { CalEvent, Repeat } from '../lib/types'
import { parseYmd, uid, ymd } from '../lib/time'

interface Props {
  id: string | null
  dateKey?: string
  opts?: { title?: string; linkTaskId?: string }
}

export function EventDialog({ id, dateKey, opts = {} }: Props) {
  const { state, commit, closeDialog, setUi, toast } = useApp()
  const src = id ? state.events.find((e) => e.id === id) : null
  const tk = ymd(new Date())
  const titleRef = useRef<HTMLInputElement>(null)
  const startRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState(src?.title ?? opts.title ?? '')
  const [date, setDate] = useState(src?.date ?? (dateKey && dateKey >= tk ? dateKey : tk))
  const [allDay, setAllDay] = useState(src?.allDay ?? false)
  const [start, setStart] = useState(src ? src.start || '' : '09:00')
  const [end, setEnd] = useState(src ? src.end || '' : '10:00')
  const [repeat, setRepeat] = useState<Repeat>(src?.repeat || 'none')
  const [notes, setNotes] = useState(src?.notes ?? '')
  const [err, setErr] = useState('')
  const [delArm, setDelArm] = useState(false)
  // tarefas ligadas no momento em que o diálogo abriu; ficam na lista mesmo depois de desvinculadas
  const [linkedIds] = useState(() => (src ? state.tasks.filter((t) => t.eventId === src.id).map((t) => t.id) : []))
  const [unlinked, setUnlinked] = useState<Record<string, string>>({})

  useEffect(() => {
    if (src) return
    const t = setTimeout(() => titleRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [src])

  const unlink = (tid: string) => {
    const t = state.tasks.find((x) => x.id === tid)
    if (!t || !t.eventId) return
    const old = t.eventId
    commit((d) => {
      delete d.tasks.find((x) => x.id === tid)!.eventId
    })
    setUnlinked((u) => ({ ...u, [tid]: old }))
  }
  const relink = (tid: string) => {
    const old = unlinked[tid]
    const t = state.tasks.find((x) => x.id === tid)
    if (!t || !eventById(state, old)) return
    commit((d) => {
      d.tasks.find((x) => x.id === tid)!.eventId = old
    })
    setUnlinked((u) => {
      const n = { ...u }
      delete n[tid]
      return n
    })
  }

  const remove = () => {
    if (!delArm) {
      setDelArm(true)
      return
    }
    const copy: CalEvent = { ...src! }
    const rep = isRepeating(src!)
    commit((d) => {
      d.events = d.events.filter((x) => x.id !== src!.id)
    })
    closeDialog()
    toast(rep ? 'Compromisso e repetições excluídos' : 'Compromisso excluído', () =>
      commit((d) => void d.events.push(copy)),
    )
  }

  const save = () => {
    const ttl = title.trim()
    const s = allDay ? '' : start
    const e = allDay ? '' : end
    if (!ttl) {
      setErr('Dê um nome ao compromisso.')
      titleRef.current?.focus()
      return
    }
    if (!date) {
      setErr('Escolha a data.')
      dateRef.current?.focus()
      return
    }
    if (date < tk) {
      setErr('A data não pode ser anterior a hoje.')
      dateRef.current?.focus()
      return
    }
    if (!allDay && !s) {
      setErr('Informe o horário de início ou marque Dia inteiro.')
      startRef.current?.focus()
      return
    }
    if (!allDay && e && e < s) {
      setErr('O fim precisa ser depois do início.')
      endRef.current?.focus()
      return
    }
    const vals: Partial<CalEvent> & Pick<CalEvent, 'title' | 'date' | 'allDay' | 'start' | 'end' | 'repeat' | 'notes'> = {
      title: ttl,
      date,
      allDay,
      start: s,
      end: e,
      repeat,
      notes: notes.trim(),
    }
    if (src && (src.date !== date || (src.repeat || 'none') !== vals.repeat)) {
      vals.doneDates = []
      vals.origin = date
    }
    commit((d) => {
      if (src) {
        Object.assign(d.events.find((x) => x.id === src.id)!, vals)
      } else {
        const nid = uid()
        d.events.push({ id: nid, ...vals, origin: date, createdAt: Date.now() })
        if (opts.linkTaskId) {
          const t = d.tasks.find((x) => x.id === opts.linkTaskId)
          if (t) t.eventId = nid
        }
      }
    })
    const dd = parseYmd(date)
    setUi({ calSel: date, calMonth: { y: dd.getFullYear(), m: dd.getMonth() } })
    closeDialog()
  }

  return (
    <div className="dlg">
      <h2>{src ? 'Editar compromisso' : 'Novo compromisso'}</h2>
      <div>
        <label className="lbl" htmlFor="e-title">
          Compromisso
        </label>
        <input
          className="field"
          id="e-title"
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Consulta no dentista"
        />
      </div>
      {linkedIds.length ? (
        <div id="e-linkbox">
          <span className="lbl">Tarefas ligadas</span>
          {linkedIds.map((tid) => {
            const t = state.tasks.find((x) => x.id === tid)
            if (!t) return null
            return tid in unlinked ? (
              <div className="linkbox" key={tid}>
                <span className="sub tw:text-[14px]">{`Desvinculada de “${t.title}”.`}</span>
                <span className="spacer"></span>
                <button type="button" className="btn" onClick={() => relink(tid)}>
                  Desfazer
                </button>
              </div>
            ) : (
              <div className="linkbox" key={tid}>
                <span className="chip green">{`🔗 ${t.title}`}</span>
                <span className="spacer"></span>
                <button type="button" className="btn danger" onClick={() => unlink(tid)}>
                  Desvincular
                </button>
              </div>
            )
          })}
        </div>
      ) : null}
      {opts.linkTaskId ? (
        <p className="sub tw:-mt-[6px] tw:mb-0 tw:text-[13px]">🔗 Vai ficar ligado à tarefa que você escolheu.</p>
      ) : null}
      <div className="row tw:items-end">
        <div className="tw:flex-[1_1_150px]">
          <label className="lbl" htmlFor="e-date">
            Data
          </label>
          <input
            className="field"
            type="date"
            id="e-date"
            ref={dateRef}
            min={tk}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="tw:flex-[1_1_150px]">
          <label className="lbl" htmlFor="e-rep">
            Repetir
          </label>
          <select
            className="field"
            id="e-rep"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value as Repeat)}
          >
            {Object.entries(REPEAT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          id="e-all"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
        />{' '}
        Dia inteiro
      </label>
      <div className="row" id="e-times" style={{ display: allDay ? 'none' : 'flex' }}>
        <div className="tw:flex-[1_1_120px]">
          <label className="lbl" htmlFor="e-start">
            Início
          </label>
          <input
            className="field"
            type="time"
            id="e-start"
            ref={startRef}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="tw:flex-[1_1_120px]">
          <label className="lbl" htmlFor="e-end">
            Fim (opcional)
          </label>
          <input
            className="field"
            type="time"
            id="e-end"
            ref={endRef}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="e-notes">
          Notas
        </label>
        <textarea
          className="field"
          id="e-notes"
          placeholder="Local, detalhes, lembretes…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <p className="err" id="e-err" role="alert">
        {err}
      </p>
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
