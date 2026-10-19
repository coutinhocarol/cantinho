import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { areaById, periodText } from '../lib/areas'
import type { Area, Period } from '../lib/types'
import { WD, firstChar, fmtWhen, uid } from '../lib/time'

export function AreaDialog({ id }: { id: string | null }) {
  const { state, commit, closeDialog, toast } = useApp()
  const src = id ? areaById(state, id) : null
  const nameRef = useRef<HTMLInputElement>(null)

  // Os dois tipos de período ficam guardados, assim trocar de aba não perde o que foi digitado.
  const [name, setName] = useState(src?.name ?? '')
  const [emoji, setEmoji] = useState(src?.emoji ?? '')
  const [acc, setAcc] = useState(src ? src.acceptsTasks !== false : true)
  const [ptype, setPtype] = useState<'interval' | 'weekly'>(src?.period.type ?? 'interval')
  const [everyStr, setEveryStr] = useState(
    String(src?.period.type === 'interval' ? src.period.every : 7),
  )
  const [days, setDays] = useState<number[]>(
    src?.period.type === 'weekly' ? [...src.period.days] : [2],
  )
  const [timeStr, setTimeStr] = useState(src?.period.type === 'weekly' ? src.period.time : '21:00')
  const [delArm, setDelArm] = useState(false)
  const [nameBad, setNameBad] = useState(false)
  const [prevErr, setPrevErr] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (src) return
    const t = setTimeout(() => nameRef.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [src])

  const period: Period =
    ptype === 'interval'
      ? { type: 'interval', every: Math.max(1, parseInt(everyStr) || 1), unit: 'days' }
      : { type: 'weekly', days, time: timeStr || '21:00' }

  const touch = () => {
    setPrevErr(false)
    setNameBad(false)
  }

  const save = () => {
    if (!name.trim()) {
      nameRef.current?.focus()
      setNameBad(true)
      return
    }
    if (period.type === 'weekly' && !period.days.length) {
      setPrevErr(true)
      return
    }
    if (src && !acc) {
      const n = state.tasks.filter((t) => t.areaId === src.id && !t.done).length
      if (n) {
        setErr(
          `Essa área ainda tem ${n} ${n === 1 ? 'tarefa' : 'tarefas'}. Conclua ou mova para outra área antes de desligar.`,
        )
        return
      }
    }
    const nm = name.trim()
    if (src) {
      commit((d) => {
        Object.assign(areaById(d, src.id)!, {
          name: nm,
          emoji,
          period,
          acceptsTasks: acc,
        })
      })
    } else {
      commit((d) => {
        const a: Area = {
          id: uid(),
          name: nm,
          emoji: emoji || '✨',
          period,
          acceptsTasks: acc,
          lastDone: null,
          history: [],
          createdAt: Date.now(),
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
        <p className="sub tw:mt-[8px] tw:text-[13px]">
          Toque no campo do emoji e escolha qualquer um no teclado de emojis.
          <span className="pc-only">
            {' '}
            No computador: Windows + ponto, ou Ctrl + Cmd + Espaço no Mac.
          </span>
        </p>
      </div>
      <div>
        <span className="lbl">Periodicidade</span>
        <div className="seg tw:mb-[12px]">
          <button
            type="button"
            aria-pressed={ptype === 'interval'}
            onClick={() => {
              setPtype('interval')
              touch()
            }}
          >
            A cada X dias
          </button>
          <button
            type="button"
            aria-pressed={ptype === 'weekly'}
            onClick={() => {
              setPtype('weekly')
              touch()
            }}
          >
            Dias da semana
          </button>
        </div>
        {ptype === 'interval' ? (
          <>
            <div className="row">
              <span>A cada</span>
              <input
                className="field tw:w-[84px]"
                type="number"
                min="1"
                max="999"
                id="f-every"
                value={everyStr}
                onChange={(e) => setEveryStr(e.target.value)}
              />
              <span>dias</span>
            </div>
            <p className="sub tw:mt-[8px] tw:text-[13px]">
              O prazo conta a partir do momento em que você checar a área.
            </p>
          </>
        ) : (
          <>
            <div className="days">
              {WD.map((w, i) => (
                <button
                  type="button"
                  key={w}
                  aria-pressed={days.includes(i)}
                  onClick={() => {
                    setDays((ds) => (ds.includes(i) ? ds.filter((x) => x !== i) : [...ds, i]))
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
                id="f-time"
                value={timeStr}
                onChange={(e) => setTimeStr(e.target.value)}
              />
            </div>
            <p className="sub tw:mt-[8px] tw:text-[13px]">
              A área volta para A checar nesses dias, no horário escolhido. Uma checagem feita antes
              do horário não vale para aquele dia.
            </p>
          </>
        )}
      </div>
      <div
        className="preview"
        id="f-prev"
        style={prevErr ? { background: 'var(--rose-tint)', color: 'var(--rose-ink)' } : undefined}
      >
        {prevErr ? 'Escolha pelo menos um dia da semana.' : periodText(period)}
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
      {src && src.history && src.history.length ? (
        <div>
          <span className="lbl">Últimas marcações</span>
          <ul className="hist">
            {src.history.slice(0, 5).map((h, i) => (
              <li key={i}>{fmtWhen(h)}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
          {src ? 'Salvar' : 'Criar área'}
        </button>
      </div>
    </div>
  )
}
