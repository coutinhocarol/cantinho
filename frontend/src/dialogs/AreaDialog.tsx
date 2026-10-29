import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { IconPlus } from '../components/icons'
import { areaById, periodText } from '../lib/areas'
import type { Area, Period, Routine } from '../lib/types'
import { WD, firstChar, fmtWhen, uid } from '../lib/time'

/** Rotina em edição. Os dois tipos de período ficam guardados, assim trocar de aba não perde o que foi digitado. */
interface Draft {
  id: string
  name: string
  ptype: 'interval' | 'weekly'
  everyStr: string
  days: number[]
  timeStr: string
  src: Routine | null
}

const draftOf = (r: Routine | null): Draft => ({
  id: r?.id ?? uid(),
  name: r?.name ?? '',
  ptype: r?.period.type ?? 'interval',
  everyStr: String(r?.period.type === 'interval' ? r.period.every : 7),
  days: r?.period.type === 'weekly' ? [...r.period.days] : [2],
  timeStr: r?.period.type === 'weekly' ? r.period.time : '21:00',
  src: r,
})

const periodOf = (d: Draft): Period =>
  d.ptype === 'interval'
    ? { type: 'interval', every: Math.max(1, parseInt(d.everyStr) || 1), unit: 'days' }
    : { type: 'weekly', days: d.days, time: d.timeStr || '21:00' }

export function AreaDialog({ id }: { id: string | null }) {
  const { state, commit, closeDialog, toast } = useApp()
  const src = id ? areaById(state, id) : null
  const nameRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(src?.name ?? '')
  const [emoji, setEmoji] = useState(src?.emoji ?? '')
  const [acc, setAcc] = useState(src ? src.acceptsTasks !== false : true)
  const [drafts, setDrafts] = useState<Draft[]>(
    src?.routines.length ? src.routines.map(draftOf) : [draftOf(null)],
  )
  const [delArm, setDelArm] = useState(false)
  const [nameBad, setNameBad] = useState(false)
  const [badNames, setBadNames] = useState<string[]>([])
  const [badDays, setBadDays] = useState<string[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    if (src) return
    const t = setTimeout(() => nameRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [src])

  const multi = drafts.length > 1
  const upd = (id: string, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  const touch = () => {
    setBadDays([])
    setBadNames([])
    setNameBad(false)
  }

  const save = () => {
    if (!name.trim()) {
      nameRef.current?.focus()
      setNameBad(true)
      return
    }
    const noName = multi ? drafts.filter((d) => !d.name.trim()).map((d) => d.id) : []
    const noDays = drafts.filter((d) => d.ptype === 'weekly' && !d.days.length).map((d) => d.id)
    if (noName.length || noDays.length) {
      setBadNames(noName)
      setBadDays(noDays)
      return
    }
    if (src && !acc) {
      const n = state.tasks.filter((t) => t.areaId === src.id).length
      if (n) {
        setErr(
          `Essa área ainda tem ${n} ${n === 1 ? 'tarefa' : 'tarefas'}. Conclua ou mova para outra área antes de desligar.`,
        )
        return
      }
    }
    const nm = name.trim()
    const now = Date.now()
    const routines: Routine[] = drafts.map((d) => ({
      id: d.id,
      name: d.name.trim(),
      period: periodOf(d),
      lastDone: d.src?.lastDone ?? null,
      history: d.src?.history ?? [],
      createdAt: d.src?.createdAt ?? now,
      ...(d.src?.forceDue ? { forceDue: d.src.forceDue } : {}),
    }))
    if (src) {
      commit((d) => {
        Object.assign(areaById(d, src.id)!, { name: nm, emoji, routines, acceptsTasks: acc })
      })
    } else {
      commit((d) => {
        const a: Area = {
          id: uid(),
          name: nm,
          emoji: emoji || '✨',
          routines,
          acceptsTasks: acc,
          createdAt: now,
          order: d.areas.length ? Math.max(...d.areas.map((x) => x.order ?? 0)) + 1 : 0,
        }
        d.areas.push(a)
      })
    }
    closeDialog()
  }

  const remove = () => {
    if (!delArm) {
      setDelArm(true)
      return
    }
    const removed = areaById(state, src!.id)!
    // as tarefas da área não são apagadas: ficam "sem área"
    const freed = state.tasks.filter((t) => t.areaId === src!.id).map((t) => t.id)
    commit((d) => {
      d.areas = d.areas.filter((a) => a.id !== src!.id)
      d.tasks.forEach((t) => {
        if (t.areaId === src!.id) t.areaId = ''
      })
    })
    closeDialog()
    toast(`${removed.name} excluída`, () =>
      commit((d) => {
        d.areas.push(removed)
        d.tasks.forEach((t) => {
          if (freed.includes(t.id)) t.areaId = removed.id
        })
      }),
    )
  }

  return (
    <div className="dlg" onChange={touch}>
      <h2>{src ? 'Editar área' : 'Nova área'}</h2>
      <div>
        <label className="lbl" htmlFor="f-name">
          Nome
        </label>
        <div className="row tw:flex-nowrap">
          <input
            className="field tw:w-[64px] tw:p-[6px] tw:text-center tw:text-[24px]"
            id="f-emoji"
            value={emoji}
            onChange={(e) => {
              setEmoji(firstChar(e.target.value))
              touch()
            }}
            placeholder="🙂"
            autoComplete="off"
            aria-label="Emoji da área"
          />
          <input
            className="field"
            id="f-name"
            ref={nameRef}
            placeholder="Ex.: Quarto"
            value={name}
            style={nameBad ? { borderColor: 'var(--rose)' } : undefined}
            onChange={(e) => {
              setName(e.target.value)
              touch()
            }}
          />
        </div>
        {src ? null : (
          <p className="sub tw:mt-[8px] tw:text-[13px]">
            Toque no campo do emoji e escolha qualquer um no teclado de emojis.
            <span className="pc-only">
              {' '}
              No computador: Windows + ponto, ou Ctrl + Cmd + Espaço no Mac.
            </span>
          </p>
        )}
      </div>
      {drafts.map((d, i) => {
        const period = periodOf(d)
        const daysBad = badDays.includes(d.id)
        return (
          <div className="routine-ed" key={d.id}>
            <div>
              <label className="lbl" htmlFor={`r-name-${d.id}`}>
                {multi ? `Rotina ${i + 1}` : 'Rotina'}
              </label>
              <div className="row tw:flex-nowrap">
                <input
                  className="field"
                  id={`r-name-${d.id}`}
                  placeholder={multi ? 'Ex.: Arrumação rápida' : 'Nome da rotina (opcional)'}
                  value={d.name}
                  style={badNames.includes(d.id) ? { borderColor: 'var(--rose)' } : undefined}
                  onChange={(e) => {
                    upd(d.id, { name: e.target.value })
                    touch()
                  }}
                />
                {multi ? (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.id !== d.id))}
                    aria-label={`Remover rotina ${i + 1}`}
                  >
                    Remover
                  </button>
                ) : null}
              </div>
              {multi ? null : (
                <p className="sub tw:mt-[8px] tw:text-[13px]">
                  Sem nome, a rotina usa o nome da área. Com mais de uma rotina, todas precisam de nome.
                </p>
              )}
            </div>
            <div>
              <span className="lbl">Periodicidade</span>
              <div className="seg tw:mb-[12px]">
                <button
                  type="button"
                  aria-pressed={d.ptype === 'interval'}
                  onClick={() => {
                    upd(d.id, { ptype: 'interval' })
                    touch()
                  }}
                >
                  A cada X dias
                </button>
                <button
                  type="button"
                  aria-pressed={d.ptype === 'weekly'}
                  onClick={() => {
                    upd(d.id, { ptype: 'weekly' })
                    touch()
                  }}
                >
                  Dias da semana
                </button>
              </div>
              {d.ptype === 'interval' ? (
                <>
                  <div className="row">
                    <span>A cada</span>
                    <input
                      className="field tw:w-[84px]"
                      type="number"
                      min="1"
                      max="999"
                      aria-label="Intervalo em dias"
                      value={d.everyStr}
                      onChange={(e) => upd(d.id, { everyStr: e.target.value })}
                    />
                    <span>dias</span>
                  </div>
                  <p className="sub tw:mt-[8px] tw:text-[13px]">
                    O prazo conta a partir do momento em que você checar a rotina.
                  </p>
                </>
              ) : (
                <>
                  <div className="days">
                    {WD.map((w, k) => (
                      <button
                        type="button"
                        key={w}
                        aria-pressed={d.days.includes(k)}
                        onClick={() => {
                          upd(d.id, {
                            days: d.days.includes(k) ? d.days.filter((x) => x !== k) : [...d.days, k],
                          })
                          touch()
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <div className="row tw:mt-[10px]">
                    <span>às</span>
                    <input
                      className="field tw:w-auto"
                      type="time"
                      aria-label="Horário"
                      value={d.timeStr}
                      onChange={(e) => upd(d.id, { timeStr: e.target.value })}
                    />
                  </div>
                  <p className="sub tw:mt-[8px] tw:text-[13px]">
                    A rotina volta para A checar nesses dias, no horário escolhido. Uma checagem feita
                    antes do horário não vale para aquele dia.
                  </p>
                </>
              )}
            </div>
            <div
              className="preview"
              style={daysBad ? { background: 'var(--rose-tint)', color: 'var(--rose-ink)' } : undefined}
            >
              {daysBad ? 'Escolha pelo menos um dia da semana.' : periodText(period)}
            </div>
            {badNames.includes(d.id) ? (
              <p className="err" role="alert">
                Dê um nome à rotina.
              </p>
            ) : null}
            {d.src && d.src.history.length ? (
              <div>
                <span className="lbl">Últimas marcações</span>
                <ul className="hist">
                  {d.src.history.slice(0, 5).map((h, k) => (
                    <li key={k}>{fmtWhen(h)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )
      })}
      <div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDrafts((ds) => [...ds, draftOf(null)])
            touch()
          }}
        >
          <IconPlus />
          Adicionar rotina
        </button>
      </div>
      <div>
        <label className="check-row">
          <input type="checkbox" id="a-acc" checked={acc} onChange={(e) => setAcc(e.target.checked)} />{' '}
          Aceita tarefas
        </label>
        <p className="sub tw:mx-0 tw:mt-[2px] tw:mb-0 tw:text-[13px]">
          Desligue se essa área não deve ter tarefas. Ela deixa de aparecer como coluna na aba
          Tarefas e na hora de criar uma tarefa.
        </p>
        <p className="err" id="a-err" role="alert">
          {err}
        </p>
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
