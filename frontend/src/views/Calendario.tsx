import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { IconCheck, IconChevL, IconChevR, IconPlus } from '../components/icons'
import { DueAlertInline } from '../components/taskParts'
import { IconLink } from '../components/icons'
import { REPEAT_LABEL, eventsOn, isEvDone, isRepeating } from '../lib/events'
import type { AppState, CalEvent } from '../lib/types'
import { capitalize, parseYmd, ymd } from '../lib/time'

function weekStartOf(key: string) {
  const d = parseYmd(key)
  const off = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - off, 12)
}

function linkedTaskLine(state: AppState, e: CalEvent) {
  const l = state.tasks.filter((t) => t.eventId === e.id)
  return l.length ? (
    <span>
      {l.map((t, i) => (
        <span key={t.id}>
          {i ? ', ' : ''}
          <IconLink />
          {t.title}
          <DueAlertInline t={t} />
        </span>
      ))}
    </span>
  ) : null
}

interface WkDrag {
  id: string
  from: string
}

function WeekEvent({
  e,
  dayKey,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  e: CalEvent
  dayKey: string
  onDragStart: (d: WkDrag) => void
  onDragEnd: () => void
  dragging: boolean
}) {
  const { state, actions, openDialog } = useApp()
  const rep = isRepeating(e)
  const lt = state.tasks.filter((t) => t.eventId === e.id)
  return (
    <div
      className={`wk-ev${rep ? ' rep' : ''}${dragging ? ' dragging-ev' : ''}`}
      draggable
      data-evid={e.id}
      data-key={dayKey}
      onDragStart={(ev) => {
        onDragStart({ id: e.id, from: dayKey })
        ev.dataTransfer.effectAllowed = 'move'
        try {
          ev.dataTransfer.setData('text/plain', e.id)
        } catch {
          /* ignore */
        }
      }}
      onDragEnd={onDragEnd}
    >
      <button
        type="button"
        className="tick"
        aria-label="Concluir compromisso"
        onClick={() => actions.completeEvent(e.id, dayKey)}
      >
        <IconCheck />
      </button>
      <button
        type="button"
        className="wk-time"
        onClick={() => openDialog({ kind: 'event', id: e.id })}
      >
        {e.allDay ? (
          'Dia inteiro'
        ) : (
          <>
            {e.start}
            {e.end ? <span className="wk-end">{e.end}</span> : null}
          </>
        )}
      </button>
      <button
        type="button"
        className="wk-main"
        onClick={() => openDialog({ kind: 'event', id: e.id })}
      >
        <span className="wk-title">{e.title}</span>
        {lt.length ? (
          <span className="wk-link">
            {lt.map((t, i) => (
              <span key={t.id}>
                {i ? ', ' : ''}
                <IconLink />
                {t.title}
                <DueAlertInline t={t} />
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </div>
  )
}

function Week({ today }: { today: string }) {
  const { state, ui, actions, openDialog, setUi } = useApp()
  const [drag, setDrag] = useState<WkDrag | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const st = weekStartOf(ui.calSel)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(st.getFullYear(), st.getMonth(), st.getDate() + i, 12)
    return { d, key: ymd(d), evs: eventsOn(state, ymd(d)) }
  })
  const endDrag = () => {
    setDrag(null)
    setOver(null)
  }
  return (
    <div className="wk">
      {days.map((c) => {
        const past = c.key < today
        const wd = c.d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
        const lab = c.d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
        return (
          <section
            key={c.key}
            className={`wk-day${c.key === today ? ' today' : ''}${past ? ' past' : ''}${
              over === c.key ? ' drop-ok' : ''
            }`}
            data-date={c.key}
            onDragOver={(e) => {
              if (!drag) return
              if (c.key < ymd(new Date())) {
                setOver(null)
                return
              }
              e.preventDefault()
              setOver(c.key)
            }}
            onDrop={(e) => {
              if (!drag) return
              e.preventDefault()
              const d = drag
              endDrag()
              actions.moveEvent(d.id, d.from, c.key, (to) => setUi({ calSel: to }))
            }}
          >
            <div className="wk-head">
              <div className="wk-pick" aria-label={lab}>
                <span className="wk-wd">{wd}</span>
                <span className="wk-num">{c.d.getDate()}</span>
              </div>
              {past ? null : (
                <button
                  type="button"
                  className="wk-add"
                  aria-label={`Novo compromisso em ${lab}`}
                  onClick={() => openDialog({ kind: 'event', id: null, dateKey: c.key })}
                >
                  <IconPlus />
                </button>
              )}
            </div>
            <div className="wk-list">
              {c.evs.map((e) => (
                <WeekEvent
                  key={e.id}
                  e={e}
                  dayKey={c.key}
                  dragging={drag?.id === e.id}
                  onDragStart={setDrag}
                  onDragEnd={endDrag}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const ROTINA_DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

const rotinaDay = (e: CalEvent) => (parseYmd(e.origin || e.date).getDay() + 6) % 7

function rotinaSort(a: CalEvent, b: CalEvent) {
  return (
    (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) ||
    (a.start || '').localeCompare(b.start || '') ||
    String(a.title).localeCompare(String(b.title))
  )
}

function rotinaWhen(e: CalEvent) {
  const d = parseYmd(e.origin || e.date)
  return e.repeat === 'monthly'
    ? `Todo dia ${d.getDate()}`
    : `Todo ${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })}`
}

function RotinaEvent({ e, sub }: { e: CalEvent; sub?: string }) {
  const { openDialog } = useApp()
  return (
    <button
      type="button"
      className="rt-ev"
      onClick={() => openDialog({ kind: 'event', id: e.id })}
    >
      <span className="wk-time">
        {sub ?? (e.allDay ? 'Dia inteiro' : e.start)}
        {sub === undefined && !e.allDay && e.end ? <span className="wk-end">{e.end}</span> : null}
      </span>
      <span className="wk-title">{e.title}</span>
    </button>
  )
}

function Rotina() {
  const { state } = useApp()
  const reps = (state.events || []).filter((e) => e.date && isRepeating(e))
  const daily = reps.filter((e) => e.repeat === 'daily').sort(rotinaSort)
  const weekly = reps.filter((e) => e.repeat === 'weekly')
  const others = reps
    .filter((e) => e.repeat === 'monthly' || e.repeat === 'yearly')
    .sort((a, b) => rotinaSort(a, b))
  return (
    <>
      <div className="wk rt">
        {ROTINA_DAYS.map((name, i) => {
          const evs = [...daily, ...weekly.filter((e) => rotinaDay(e) === i)].sort(rotinaSort)
          return (
            <section key={name} className="wk-day">
              <div className="wk-head">
                <span className="wk-wd">{name}</span>
              </div>
              <div className="wk-list">
                {evs.length ? (
                  evs.map((e) => <RotinaEvent key={e.id} e={e} />)
                ) : (
                  <p className="wk-empty">Nada recorrente.</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
      <section className="rt-other">
        <h2>Mensais e anuais</h2>
        {others.length ? (
          <div className="rt-other-list">
            {others.map((e) => (
              <RotinaEvent key={e.id} e={e} sub={rotinaWhen(e)} />
            ))}
          </div>
        ) : (
          <p className="wk-empty">Nenhum compromisso mensal ou anual.</p>
        )}
      </section>
    </>
  )
}

function weekTitle(ui: { calSel: string }) {
  const st = weekStartOf(ui.calSel)
  const a = st
  const z = new Date(st.getFullYear(), st.getMonth(), st.getDate() + 6, 12)
  const mo = (d: Date, o: Intl.DateTimeFormatOptions) =>
    d.toLocaleDateString('pt-BR', o).replace('.', '')
  if (a.getMonth() === z.getMonth())
    return `${a.getDate()} a ${z.getDate()} de ${mo(z, { month: 'long' })} de ${z.getFullYear()}`
  if (a.getFullYear() === z.getFullYear())
    return `${a.getDate()} ${mo(a, { month: 'short' })} a ${z.getDate()} ${mo(z, { month: 'short' })} ${z.getFullYear()}`
  return `${a.getDate()} ${mo(a, { month: 'short' })} ${a.getFullYear()} a ${z.getDate()} ${mo(z, { month: 'short' })} ${z.getFullYear()}`
}

export function Calendario() {
  const { state, ui, setUi, actions, openDialog } = useApp()
  const barRef = useRef<HTMLDivElement>(null)
  const sideRef = useRef<HTMLElement>(null)
  const rotina = ui.calView === 'rotina'
  const week = ui.calView === 'semana'
  const today = ymd(new Date())

  // Alinha a coluna lateral com a barra do calendário quando ficam lado a lado.
  useLayoutEffect(() => {
    const align = () => {
      const bar = barRef.current
      const side = sideRef.current
      if (!bar || !side) return
      side.style.marginTop = '0px'
      const b = bar.getBoundingClientRect()
      const s = side.getBoundingClientRect()
      if (b.width > 0 && s.left >= b.right - 1)
        side.style.marginTop = Math.max(0, Math.round(b.top - s.top)) + 'px'
    }
    align()
    window.addEventListener('resize', align)
    return () => window.removeEventListener('resize', align)
  })

  const { y, m } = ui.calMonth
  const first = new Date(y, m, 1, 12)
  const off = (first.getDay() + 6) % 7
  const dim = new Date(y, m + 1, 0).getDate()
  const weeks = Math.ceil((off + dim) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(y, m, 1 - off + i, 12)
    const key = ymd(d)
    return { d, key, evs: eventsOn(state, key), out: d.getMonth() !== m }
  })
  const title = capitalize(first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
  const selEvs = eventsOn(state, ui.calSel)
  const selTitle = capitalize(
    parseYmd(ui.calSel).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
  )

  const setView = (v: 'mes' | 'semana' | 'rotina') => {
    setUi({ calView: v })
    try {
      localStorage.setItem('cantinho-calview', v)
    } catch {
      /* sem armazenamento */
    }
  }
  const shiftMonth = (delta: number) => {
    let { y: yy, m: mm } = ui.calMonth
    mm += delta
    while (mm < 0) {
      mm += 12
      yy--
    }
    while (mm > 11) {
      mm -= 12
      yy++
    }
    const sel = parseYmd(ui.calSel)
    let calSel = ui.calSel
    if (sel.getFullYear() !== yy || sel.getMonth() !== mm) {
      const t = new Date()
      calSel = t.getFullYear() === yy && t.getMonth() === mm ? ymd(t) : ymd(new Date(yy, mm, 1))
    }
    setUi({ calMonth: { y: yy, m: mm }, calSel })
  }
  const shiftWeek = (delta: number) => {
    const d = parseYmd(ui.calSel)
    d.setDate(d.getDate() + 7 * delta)
    setUi({ calSel: ymd(d), calMonth: { y: d.getFullYear(), m: d.getMonth() } })
  }
  const pick = (key: string) => {
    const d = parseYmd(key)
    setUi({ calSel: key, calMonth: { y: d.getFullYear(), m: d.getMonth() } })
  }
  const goToday = () => {
    const t = new Date()
    setUi({ calSel: ymd(t), calMonth: { y: t.getFullYear(), m: t.getMonth() } })
  }

  return (
    <>
      <div className="board-head">
        <div>
          <h1>Calendário</h1>
        </div>
        <button
          className="btn primary"
          onClick={() => openDialog({ kind: 'event', id: null, dateKey: ui.calSel })}
        >
          <IconPlus />
          Novo compromisso
        </button>
      </div>
      <div className={`cal-layout${week || rotina ? ' week' : ''}`}>
        <div>
          <div className="tview">
            <div className="seg inl">
              <button
                type="button"
                aria-pressed={!week && !rotina}
                onClick={() => setView('mes')}
              >
                Mês
              </button>
              <button type="button" aria-pressed={week} onClick={() => setView('semana')}>
                Semana
              </button>
              <button type="button" aria-pressed={rotina} onClick={() => setView('rotina')}>
                Rotina
              </button>
            </div>
          </div>
          {rotina ? (
            <Rotina />
          ) : (
            <>
          <div className="cal-bar" ref={barRef}>
            <span className="cal-title">{week ? weekTitle(ui) : title}</span>
            <button type="button" className="btn" onClick={goToday}>
              Hoje
            </button>
            <button
              type="button"
              className="cal-nav"
              aria-label={week ? 'Semana anterior' : 'Mês anterior'}
              onClick={() => (week ? shiftWeek(-1) : shiftMonth(-1))}
            >
              <IconChevL />
            </button>
            <button
              type="button"
              className="cal-nav"
              aria-label={week ? 'Próxima semana' : 'Próximo mês'}
              onClick={() => (week ? shiftWeek(1) : shiftMonth(1))}
            >
              <IconChevR />
            </button>
          </div>
          {week ? (
            <Week today={today} />
          ) : (
            <div className="cal">
              <div className="cal-head">
                {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w) => (
                  <div key={w}>{w}</div>
                ))}
              </div>
              <div className="cal-grid">
                {cells.map((c) => {
                  const n = c.evs.length
                  const lab =
                    c.d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) +
                    (n ? `, ${n} compromisso${n === 1 ? '' : 's'}` : '') +
                    (c.key < today ? ', dia passado' : '')
                  return (
                    <button
                      key={c.key}
                      type="button"
                      className={`cal-day${c.out ? ' out' : ''}${c.key === today ? ' today' : ''}${
                        c.key < today ? ' past' : ''
                      }`}
                      aria-pressed={c.key === ui.calSel}
                      aria-label={lab}
                      onClick={() => pick(c.key)}
                    >
                      <span className="cal-num">{c.d.getDate()}</span>
                      {n ? (
                        <span className="cal-dots">
                          {c.evs.slice(0, 3).map((e) => (
                            <i
                              key={e.id}
                              className={`dot${isEvDone(e, c.key) ? ' done' : ''}${isRepeating(e) ? ' rep' : ''}`}
                            ></i>
                          ))}
                        </span>
                      ) : null}
                      <span className="cal-chips">
                        {c.evs.slice(0, 3).map((e) => (
                          <span
                            key={e.id}
                            className={`cal-chip${e.allDay ? ' all' : ''}${isEvDone(e, c.key) ? ' done' : ''}${
                              isRepeating(e) ? ' rep' : ''
                            }`}
                          >
                            {e.title}
                          </span>
                        ))}
                        {n > 3 ? <span className="cal-more">{`+${n - 3} mais`}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
            </>
          )}
        </div>
        {week || rotina ? null : (
          <aside className="cal-side" ref={sideRef}>
            <h2>
              {selTitle}
              {ui.calSel === today ? (
                <>
                  {' '}
                  <span className="chip green">Hoje</span>
                </>
              ) : null}
            </h2>
            {selEvs.length ? (
              <div className="ev-list">
                {selEvs.map((e) => (
                  <div className={`ev${isRepeating(e) ? ' rep' : ''}`} key={e.id}>
                    <button
                      type="button"
                      className="tick"
                      aria-label="Concluir compromisso"
                      onClick={() => actions.completeEvent(e.id, ui.calSel)}
                    >
                      <IconCheck />
                    </button>
                    <button
                      type="button"
                      className="ev-main"
                      onClick={() => openDialog({ kind: 'event', id: e.id })}
                    >
                      <span className="ev-time">
                        {e.allDay ? (
                          'Dia inteiro'
                        ) : (
                          <>
                            {e.start}
                            {e.end ? <span className="ev-end">{e.end}</span> : null}
                          </>
                        )}
                      </span>
                      <span className="ev-body">
                        <b>{e.title}</b>
                        {linkedTaskLine(state, e)}
                        {isRepeating(e) ? <span>{REPEAT_LABEL[e.repeat]}</span> : null}
                        {e.notes ? <span className="ev-notes">{e.notes}</span> : null}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            ) : ui.calSel < today ? (
              <p className="past-note">
                Esse dia já passou, então não dá para adicionar compromissos nele.
              </p>
            ) : (
              <p className="sub">Nenhum compromisso neste dia.</p>
            )}
            {ui.calSel < today ? null : (
              <button
                type="button"
                className="btn primary"
                onClick={() => openDialog({ kind: 'event', id: null, dateKey: ui.calSel })}
              >
                <IconPlus />
                Novo compromisso neste dia
              </button>
            )}
          </aside>
        )}
      </div>
    </>
  )
}
