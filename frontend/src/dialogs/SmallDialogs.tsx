import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { IconPlus } from '../components/icons'
import { QUADS } from '../lib/areas'
import { eventById, isLinked } from '../lib/events'
import { KINDS, LISTS } from '../lib/lists'
import { clampGoal, waterCount, waterGoal } from '../lib/state'
import type { KindId, ListId, QuadId } from '../lib/types'
import { fmtDayMonth, parseYmd, ymd } from '../lib/time'

/* ---------------- editar item de lista ---------------- */
export function ListItemDialog({ list, id }: { list: ListId; id: string }) {
  const { state, commit, closeDialog, toast } = useApp()
  const L = LISTS.find((x) => x.id === list)!
  const it = (state.lists[list] || []).find((x) => x.id === id)
  const [title, setTitle] = useState(it?.title ?? '')
  const [kind, setKind] = useState<KindId | ''>(it?.kind ?? '')
  const [note, setNote] = useState(it?.note ?? '')
  const [delArm, setDelArm] = useState(false)
  const [bad, setBad] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const byCreated = (a: { createdAt: number }, b: { createdAt: number }) =>
    (a.createdAt || 0) - (b.createdAt || 0)
  if (!it) return null

  const remove = () => {
    if (!delArm) {
      setDelArm(true)
      return
    }
    const copy = { ...it }
    commit((d) => {
      d.lists[list] = d.lists[list].filter((x) => x.id !== id)
    })
    closeDialog()
    toast('Item excluído', () =>
      commit((d) => {
        d.lists[list].push(copy)
        d.lists[list].sort(byCreated)
      }),
    )
  }
  const save = () => {
    const t = title.trim()
    if (!t) {
      titleRef.current?.focus()
      setBad(true)
      return
    }
    commit((d) => {
      const x = d.lists[list].find((y) => y.id === id)!
      x.title = t
      x.note = note.trim()
      if (L.kinds) x.kind = kind
    })
    closeDialog()
  }

  return (
    <div className="dlg">
      <h2>Editar item</h2>
      <div>
        <label className="lbl" htmlFor="li-title">
          {L.id === 'hobbies' ? 'Hobby' : 'Título'}
        </label>
        <input
          className="field"
          id="li-title"
          ref={titleRef}
          value={title}
          style={bad ? { borderColor: 'var(--rose)' } : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      {L.kinds ? (
        <div>
          <label className="lbl" htmlFor="li-kind">
            Emoji
          </label>
          <select
            className="field"
            id="li-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as KindId | '')}
          >
            <option value="">Sem emoji</option>
            {Object.entries(KINDS).map(([k, v]) => (
              <option key={k} value={k}>
                {`${v.emoji} ${v.label}`}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label className="lbl" htmlFor="li-note">
          Notas
        </label>
        <textarea
          className="field"
          id="li-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            L.kinds
              ? 'Quem indicou, onde assistir ou ler…'
              : 'Por que quer experimentar, o que precisa…'
          }
        />
      </div>
      <div className="dlg-foot">
        <button type="button" className="btn danger" data-dact="delete" onClick={remove}>
          {delArm ? 'Toque de novo para excluir' : 'Excluir'}
        </button>
        <span className="spacer"></span>
        <button type="button" className="btn ghost" data-dact="cancel" onClick={closeDialog}>
          Cancelar
        </button>
        <button type="button" className="btn primary" data-dact="save" onClick={save}>
          Salvar
        </button>
      </div>
    </div>
  )
}

/* ---------------- meta de água ---------------- */
export function WaterGoalDialog() {
  const { state, commit, closeDialog } = useApp()
  const [goal, setGoal] = useState(String(waterGoal(state)))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      ref.current?.focus()
      ref.current?.select()
    }, 30)
    return () => clearTimeout(t)
  }, [])
  const save = () => {
    const g = clampGoal(parseInt(goal) || 10)
    const c = waterCount(state)
    commit((d) => {
      d.water = { goal: g, date: ymd(new Date()), count: Math.min(c, g), v2: true }
    })
    closeDialog()
  }
  return (
    <div className="dlg">
      <h2>Meta de água</h2>
      <div>
        <label className="lbl" htmlFor="w-goal">
          Quantos copos por dia?
        </label>
        <input
          className="field"
          id="w-goal"
          ref={ref}
          type="number"
          inputMode="numeric"
          min="1"
          max="30"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
      </div>
      <p className="sub tw:m-0 tw:text-[13px]">Cada copo tem 250 ml. A contagem volta a zero todo dia.</p>
      <div className="dlg-foot">
        <span className="spacer"></span>
        <button type="button" className="btn ghost" data-dact="cancel" onClick={closeDialog}>
          Cancelar
        </button>
        <button type="button" className="btn primary" data-dact="save" onClick={save}>
          Salvar
        </button>
      </div>
    </div>
  )
}

/* ---------------- ligar tarefa a compromisso ---------------- */
export function ScheduleDialog({ taskId }: { taskId: string }) {
  const { state, commit, closeDialog, openDialog, toast } = useApp()
  const t = state.tasks.find((x) => x.id === taskId)
  const evs = [...state.events].sort((a, b) =>
    (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')),
  )
  const cur = t && t.eventId ? eventById(state, t.eventId) : null
  const [sel, setSel] = useState(cur ? cur.id : (evs[0]?.id ?? ''))
  if (!t) return null
  const fmt = (e: (typeof evs)[number]) =>
    `${fmtDayMonth(parseYmd(e.date))}${e.allDay ? '' : ' ' + e.start} - ${e.title}`

  return (
    <div className="dlg">
      <div>
        <h2>{t.quad === 'agendar' ? 'Agendar tarefa' : 'Ligar a um compromisso'}</h2>
        <p className="sub tw:mt-[4px]">
          {t.quad === 'agendar'
            ? `“${t.title}” está em Agendar, então precisa estar ligada a um compromisso do calendário.`
            : `“${t.title}” pode ficar ligada a um compromisso do calendário. É opcional.`}
        </p>
      </div>
      {cur ? (
        <p className="sub tw:m-0 tw:text-[14px]">
          Ligada agora a: <b>{fmt(cur)}</b>
        </p>
      ) : null}
      <button
        type="button"
        className="btn primary tw:justify-center"
        data-dact="new"
        onClick={() =>
          openDialog({
            kind: 'event',
            id: null,
            dateKey: ymd(new Date()),
            opts: { title: t.title, linkTaskId: t.id },
          })
        }
      >
        <IconPlus />
        Criar novo compromisso
      </button>
      {evs.length ? (
        <div>
          <label className="lbl" htmlFor="s-ev">
            Ou ligar a um compromisso que já existe
          </label>
          <div className="row tw:flex-nowrap">
            <select
              className="field tw:min-w-0 tw:flex-1"
              id="s-ev"
              value={sel}
              onChange={(e) => setSel(e.target.value)}
            >
              {evs.map((e) => (
                <option key={e.id} value={e.id}>
                  {fmt(e)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              data-dact="link"
              onClick={() => {
                if (!sel) return
                commit((d) => {
                  d.tasks.find((x) => x.id === taskId)!.eventId = sel
                })
                closeDialog()
                toast('Tarefa ligada ao compromisso')
              }}
            >
              Ligar
            </button>
          </div>
        </div>
      ) : null}
      <div className="dlg-foot">
        {cur ? (
          <button
            type="button"
            className="btn danger"
            data-dact="unlink"
            onClick={() => {
              commit((d) => {
                delete d.tasks.find((x) => x.id === taskId)!.eventId
              })
              closeDialog()
            }}
          >
            Desfazer ligação
          </button>
        ) : null}
        <span className="spacer"></span>
        <button type="button" className="btn ghost" data-dact="cancel" onClick={closeDialog}>
          Agora não
        </button>
      </div>
    </div>
  )
}

/* ---------------- mover entre quadrantes ---------------- */
export function MoveDialog({ taskId }: { taskId: string }) {
  const { state, store, commit, closeDialog, openDialog } = useApp()
  const t = state.tasks.find((x) => x.id === taskId)
  if (!t) return null
  const choose = (q: QuadId | '') => {
    commit((d) => {
      d.tasks.find((x) => x.id === taskId)!.quad = q
    })
    const now = store.getState().tasks.find((x) => x.id === taskId)!
    if (now.quad === 'agendar' && !isLinked(store.getState(), now)) openDialog({ kind: 'schedule', taskId })
    else closeDialog()
  }
  return (
    <div className="dlg">
      <div>
        <h2>{t.title}</h2>
        <p className="sub tw:mt-[4px]">Em qual quadrante essa tarefa fica?</p>
      </div>
      <div className="mv">
        {QUADS.map((q) => (
          <button
            type="button"
            key={q.id}
            className={`mv-btn q-${q.id}`}
            aria-pressed={t.quad === q.id}
            onClick={() => choose(q.id)}
          >
            <b>{q.title}</b>
            <span>{q.sub}</span>
          </button>
        ))}
        <button
          type="button"
          className="mv-btn mv-none"
          aria-pressed={!t.quad}
          onClick={() => choose('')}
        >
          <b>Sem classificação</b>
          <span>Tirar da matriz de priorização</span>
        </button>
      </div>
      <div className="dlg-foot">
        <span className="spacer"></span>
        <button
          type="button"
          className="btn ghost"
          data-dact="edit"
          onClick={() => openDialog({ kind: 'task', id: taskId })}
        >
          Editar tarefa
        </button>
        <button type="button" className="btn" data-dact="cancel" onClick={closeDialog}>
          Fechar
        </button>
      </div>
    </div>
  )
}
