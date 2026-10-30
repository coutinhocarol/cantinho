import { areaById, routineById, routineLabel, routineStatus } from './areas'
import type { Store } from './store'
import type { Area, AppState, CalEvent, ListId, ListItem, Note, Period, Task } from './types'
import { DAY, fmtDayMonth, fmtWhen, parseYmd, uid, ymd } from './time'

type ToastFn = (msg: string, undo?: () => void) => void

export interface Actions {
  markDone(areaId: string, routineId: string): void
  toggleTask(id: string): void
  completeEvent(id: string, key: string): void
  moveEvent(id: string, fromKey: string, toKey: string, onMoved?: (toKey: string) => void): void
  addListItem(list: ListId, title: string): void
  doneListItem(list: ListId, itemId: string, msg: string): void
  confirmMissed(id: string): void
  doneReprio(): void
  forceAll(): void
  forceDue(areaId: string, routineId: string): void
  reorderAreas(ids: string[]): void
  addNote(): string
  updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body'>>): void
  deleteNote(id: string): void
  addExamples(): void
}

export function createActions(store: Store, toast: ToastFn): Actions {
  const { commit } = store
  const get = () => store.getState()

  const byCreated = (a: ListItem, b: ListItem) => (a.createdAt || 0) - (b.createdAt || 0)

  return {
    markDone(areaId, routineId) {
      const a = areaById(get(), areaId)
      const r = routineById(a, routineId)
      if (!a || !r) return
      const label = routineLabel(a, r)
      const prev = { lastDone: r.lastDone, history: [...(r.history || [])], forceDue: r.forceDue }
      const now = Date.now()
      const early = r.period.type === 'weekly' && !routineStatus(r, now).due
      const nextAt = early ? routineStatus(r, now).nextAt : null
      commit((d) => {
        const x = routineById(areaById(d, areaId), routineId)!
        x.lastDone = now
        x.history = [now, ...(x.history || [])].slice(0, 5)
        delete x.forceDue
      })
      const hhmm = new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      toast(
        early && nextAt
          ? `${label} checada às ${hhmm}. Volta a ficar pendente ${fmtWhen(nextAt)}`
          : `${label} checada às ${hhmm}`,
        () => {
          const x = routineById(areaById(get(), areaId), routineId)
          if (!x) return
          commit((d) => {
            const y = routineById(areaById(d, areaId), routineId)!
            y.lastDone = prev.lastDone
            y.history = prev.history
            if (prev.forceDue) y.forceDue = prev.forceDue
          })
        },
      )
    },

    toggleTask(id) {
      const t = get().tasks.find((x) => x.id === id)
      if (!t) return
      const copy: Task = { ...t }
      commit((d) => {
        d.tasks = d.tasks.filter((x) => x.id !== id)
      })
      toast('Tarefa concluída', () => commit((d) => void d.tasks.push(copy)))
    },

    completeEvent(id, key) {
      const e = get().events.find((x) => x.id === id)
      if (!e) return
      if (!e.repeat || e.repeat === 'none') {
        const copy: CalEvent = { ...e }
        const linked = get()
          .tasks.filter((t) => t.eventId === id)
          .map((t) => ({ ...t }))
        commit((d) => {
          d.events = d.events.filter((x) => x.id !== id)
          d.tasks = d.tasks.filter((t) => t.eventId !== id)
        })
        toast(linked.length ? 'Compromisso e tarefa concluídos' : 'Compromisso concluído', () =>
          commit((d) => {
            d.events.push(copy)
            d.tasks.push(...linked)
          }),
        )
      } else {
        commit((d) => {
          const x = d.events.find((y) => y.id === id)!
          x.doneDates = [...new Set([...(x.doneDates || []), key])]
        })
        toast('Compromisso concluído', () => {
          if (!get().events.some((y) => y.id === id)) return
          commit((d) => {
            const x = d.events.find((y) => y.id === id)!
            x.doneDates = (x.doneDates || []).filter((k) => k !== key)
          })
        })
      }
    },

    moveEvent(id, fromKey, toKey, onMoved) {
      const e = get().events.find((x) => x.id === id)
      if (!e || !toKey || toKey === fromKey || toKey < ymd(new Date())) return
      const delta = Math.round((parseYmd(toKey).getTime() - parseYmd(fromKey).getTime()) / DAY)
      const shift = (k: string) => {
        const d = parseYmd(k)
        d.setDate(d.getDate() + delta)
        return ymd(d)
      }
      const prev = {
        date: e.date,
        origin: e.origin,
        doneDates: e.doneDates ? [...e.doneDates] : undefined,
      }
      const rep = !!e.repeat && e.repeat !== 'none'
      commit((d) => {
        const x = d.events.find((y) => y.id === id)!
        x.date = shift(x.date)
        x.origin = shift(x.origin || prev.date)
        if (x.doneDates) x.doneDates = x.doneDates.map(shift)
      })
      onMoved?.(toKey)
      const dd = fmtDayMonth(parseYmd(toKey))
      toast(
        rep
          ? `Compromisso que se repete movido para ${dd}: a série inteira mudou`
          : `Compromisso movido para ${dd}`,
        () => {
          if (!get().events.some((y) => y.id === id)) return
          commit((d) => {
            const x = d.events.find((y) => y.id === id)!
            x.date = prev.date
            x.origin = prev.origin
            if (prev.doneDates) x.doneDates = prev.doneDates
            else delete x.doneDates
          })
        },
      )
    },

    addListItem(list, title) {
      const item: ListItem = { id: uid(), title, createdAt: Date.now() }
      commit((d) => void d.lists[list].push(item))
    },

    doneListItem(list, itemId, msg) {
      const it = (get().lists[list] || []).find((x) => x.id === itemId)
      if (!it) return
      const copy = { ...it }
      commit((d) => {
        d.lists[list] = d.lists[list].filter((x) => x.id !== itemId)
      })
      toast(msg, () =>
        commit((d) => {
          d.lists[list].push(copy)
          d.lists[list].sort(byCreated)
        }),
      )
    },

    confirmMissed(id) {
      const m = get().missed.find((x) => x.id === id)
      if (!m) return
      const copy = { ...m }
      commit((d) => {
        d.missed = d.missed.filter((x) => x.id !== id)
      })
      toast('Exclusão confirmada', () =>
        commit((d) => {
          if (!d.missed.some((x) => x.id === copy.id)) d.missed.push(copy)
        }),
      )
    },

    doneReprio() {
      const prev = get().reprioDate
      commit((d) => {
        d.reprioDate = ymd(new Date())
      })
      toast('Repriorização checada', () =>
        commit((d) => {
          d.reprioDate = prev
        }),
      )
    },

    forceAll() {
      const now = Date.now()
      const refs: [string, string][] = []
      get().areas.forEach((a) =>
        a.routines.forEach((r) => {
          if (!routineStatus(r, now).due) refs.push([a.id, r.id])
        }),
      )
      if (!refs.length) return
      const each = (d: AppState, fn: (r: Area['routines'][number]) => void) =>
        refs.forEach(([aId, rId]) => {
          const x = routineById(areaById(d, aId), rId)
          if (x) fn(x)
        })
      commit((d) => each(d, (r) => void (r.forceDue = now)))
      toast(
        `${refs.length} ${refs.length === 1 ? 'rotina foi' : 'rotinas foram'} pra A checar`,
        () => commit((d) => each(d, (r) => void delete r.forceDue)),
      )
    },

    forceDue(areaId, routineId) {
      const a = areaById(get(), areaId)
      const r = routineById(a, routineId)
      if (!a || !r) return
      commit((d) => {
        routineById(areaById(d, areaId), routineId)!.forceDue = Date.now()
      })
      toast(`${routineLabel(a, r)} voltou para A checar`, () => {
        const x = routineById(areaById(get(), areaId), routineId)
        if (!x) return
        commit((d) => {
          delete routineById(areaById(d, areaId), routineId)!.forceDue
        })
      })
    },

    reorderAreas(ids) {
      const s = get()
      if (!ids.some((id, i) => areaById(s, id)?.order !== i)) {
        store.refresh()
        return
      }
      commit((d) =>
        ids.forEach((id, i) => {
          const a = areaById(d, id)
          if (a) a.order = i
        }),
      )
    },

    addNote() {
      const now = Date.now()
      const note: Note = { id: uid(), title: '', body: '', createdAt: now, updatedAt: now }
      commit((d) => void d.notes.push(note))
      return note.id
    },

    updateNote(id, patch) {
      const n = get().notes.find((x) => x.id === id)
      if (!n || (patch.title ?? n.title) === n.title && (patch.body ?? n.body) === n.body) return
      commit((d) => {
        const x = d.notes.find((y) => y.id === id)!
        Object.assign(x, patch, { updatedAt: Date.now() })
      })
    },

    deleteNote(id) {
      const n = get().notes.find((x) => x.id === id)
      if (!n) return
      const copy: Note = { ...n }
      commit((d) => {
        d.notes = d.notes.filter((x) => x.id !== id)
      })
      toast('Nota excluída', () =>
        commit((d) => {
          if (!d.notes.some((x) => x.id === copy.id)) d.notes.push(copy)
        }),
      )
    },

    addExamples() {
      const now = Date.now()
      commit((s: AppState) => {
        const rt = (name: string, period: Period, lastDone: number | null): Area['routines'][number] => ({
          id: uid(),
          name,
          period,
          lastDone,
          history: lastDone ? [lastDone] : [],
          createdAt: now - 30 * DAY,
        })
        const mk = (name: string, emoji: string, routines: Area['routines']): Area => ({
          id: uid(),
          name,
          emoji,
          routines,
          createdAt: now - 30 * DAY,
          order: s.areas.length,
        })
        const ex = [
          mk('Quarto', '🛏️', [
            rt('Arrumação rápida', { type: 'interval', every: 1, unit: 'days' }, now - DAY / 2),
            rt('Limpeza geral', { type: 'interval', every: 7, unit: 'days' }, now - 8 * DAY),
          ]),
          mk('Plantas', '🪴', [rt('', { type: 'weekly', days: [2], time: '21:00' }, null)]),
          mk('Cozinha', '🍳', [rt('', { type: 'interval', every: 2, unit: 'days' }, now - DAY)]),
          mk('Finanças', '🧾', [rt('', { type: 'interval', every: 30, unit: 'days' }, now - 12 * DAY)]),
        ]
        ex.forEach((a, i) => {
          a.order = s.areas.length + i
          s.areas.push(a)
        })
        const q = ex[0].id
        const c = ex[2].id
        const f = ex[3].id
        const base = { notes: '', due: '', createdAt: now }
        s.tasks.push(
          { id: uid(), title: 'Trocar a roupa de cama', quad: 'fazer', areaId: q, ...base },
          { id: uid(), title: 'Organizar o guarda-roupa', quad: 'agendar', areaId: q, ...base },
          { id: uid(), title: 'Descongelar o freezer', areaId: c, ...base },
          { id: uid(), title: 'Pagar a fatura do cartão', quad: 'fazer', areaId: f, ...base },
        )
        const dk = (n: number) => ymd(new Date(Date.now() + n * DAY))
        s.lists.indicacoes.push(
          { id: uid(), title: 'Cem anos de solidão', kind: 'livro', createdAt: now },
          { id: uid(), title: 'Parasita', kind: 'filme', createdAt: now + 1 },
        )
        s.lists.hobbies.push(
          { id: uid(), title: 'Cerâmica', createdAt: now },
          { id: uid(), title: 'Aquarela', createdAt: now + 1 },
        )
        const ev = (title: string, n: number, start: string, end: string, repeat: CalEvent['repeat']) =>
          s.events.push({
            id: uid(),
            title,
            date: dk(n),
            allDay: false,
            start,
            end,
            repeat,
            notes: '',
            createdAt: now,
          })
        ev('Reunião de alinhamento', 0, '10:00', '11:00', 'none')
        ev('Consulta no dentista', 1, '15:00', '16:00', 'none')
        ev('Aula de yoga', 3, '19:00', '20:00', 'weekly')
      })
      toast('Exemplos adicionados. Edite ou exclua em Áreas.')
    },
  }
}
