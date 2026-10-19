import { areaById, areaStatus } from './areas'
import type { Store } from './store'
import { waterCount, waterGoal } from './state'
import type { Area, AppState, CalEvent, ListId, ListItem, Task } from './types'
import { DAY, fmtDayMonth, fmtWhen, parseYmd, uid, ymd } from './time'

export type ToastFn = (msg: string, undo?: () => void) => void

export interface Actions {
  markDone(id: string): void
  toggleTask(id: string): void
  completeEvent(id: string, key: string): void
  moveEvent(id: string, fromKey: string, toKey: string, onMoved?: (toKey: string) => void): void
  addListItem(list: ListId, title: string): void
  doneListItem(list: ListId, itemId: string, msg: string): void
  setWater(i: number): void
  forceAll(): void
  forceDue(id: string): void
  reorderAreas(ids: string[]): void
  addExamples(): void
}

export function createActions(store: Store, toast: ToastFn): Actions {
  const { commit } = store
  const get = () => store.getState()

  const byCreated = (a: ListItem, b: ListItem) => (a.createdAt || 0) - (b.createdAt || 0)

  return {
    markDone(id) {
      const a = areaById(get(), id)
      if (!a) return
      const prev = { lastDone: a.lastDone, history: [...(a.history || [])], forceDue: a.forceDue }
      const now = Date.now()
      const early = a.period.type === 'weekly' && !areaStatus(a, now).due
      const nextAt = early ? areaStatus(a, now).nextAt : null
      commit((d) => {
        const x = areaById(d, id)!
        x.lastDone = now
        x.history = [now, ...(x.history || [])].slice(0, 30)
        delete x.forceDue
      })
      const hhmm = new Date(now).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      toast(
        early && nextAt
          ? `${a.name} checada às ${hhmm}. Volta a ficar pendente ${fmtWhen(nextAt)}`
          : `${a.name} checada às ${hhmm}`,
        () => {
          if (!areaById(get(), id)) return
          commit((d) => {
            const x = areaById(d, id)!
            x.lastDone = prev.lastDone
            x.history = prev.history
            if (prev.forceDue) x.forceDue = prev.forceDue
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

    setWater(i) {
      const s = get()
      const cur = waterCount(s)
      const goal = waterGoal(s)
      commit((d) => {
        d.water.date = ymd(new Date())
        d.water.goal = goal
        d.water.count = i <= cur ? i - 1 : i
      })
    },

    forceAll() {
      const now = Date.now()
      const ids: string[] = []
      get().areas.forEach((a) => {
        if (!areaStatus(a, now).due) ids.push(a.id)
      })
      if (!ids.length) return
      commit((d) =>
        d.areas.forEach((a) => {
          if (ids.includes(a.id)) a.forceDue = now
        }),
      )
      toast(`${ids.length} ${ids.length === 1 ? 'área foi' : 'áreas foram'} pra A checar`, () =>
        commit((d) =>
          ids.forEach((i) => {
            const x = areaById(d, i)
            if (x) delete x.forceDue
          }),
        ),
      )
    },

    forceDue(id) {
      const a = areaById(get(), id)
      if (!a) return
      commit((d) => {
        areaById(d, id)!.forceDue = Date.now()
      })
      toast(`${a.name} voltou para A checar`, () => {
        if (!areaById(get(), id)) return
        commit((d) => {
          delete areaById(d, id)!.forceDue
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

    addExamples() {
      const now = Date.now()
      commit((s: AppState) => {
        const mk = (
          name: string,
          emoji: string,
          color: string,
          period: Area['period'],
          lastDone: number | null,
        ): Area => ({
          id: uid(),
          name,
          emoji,
          color,
          period,
          lastDone,
          history: lastDone ? [lastDone] : [],
          createdAt: now - 30 * DAY,
          order: s.areas.length,
        })
        const ex = [
          mk('Quarto', '🛏️', 'rose', { type: 'interval', every: 7, unit: 'days' }, now - 8 * DAY),
          mk('Plantas', '🪴', 'green', { type: 'weekly', days: [2], time: '21:00' }, null),
          mk('Cozinha', '🍳', 'green', { type: 'interval', every: 2, unit: 'days' }, now - DAY),
          mk('Finanças', '🧾', 'rose', { type: 'interval', every: 30, unit: 'days' }, now - 12 * DAY),
        ]
        ex.forEach((a, i) => {
          a.order = s.areas.length + i
          s.areas.push(a)
        })
        const q = ex[0].id
        const c = ex[2].id
        const f = ex[3].id
        const base = { notes: '', due: '', done: false, doneAt: null, createdAt: now }
        s.tasks.push(
          { id: uid(), title: 'Trocar a roupa de cama', quad: 'fazer', areaId: q, ...base },
          { id: uid(), title: 'Organizar o guarda-roupa', quad: 'agendar', areaId: q, ...base },
          { id: uid(), title: 'Descongelar o freezer', areaId: c, ...base },
          { id: uid(), title: 'Pagar a fatura do cartão', quad: 'fazer', areaId: f, ...base },
        )
        const dk = (n: number) => ymd(new Date(Date.now() + n * DAY))
        s.lists.compras.push(
          { id: uid(), title: 'Leite', createdAt: now },
          { id: uid(), title: 'Pão', createdAt: now + 1 },
        )
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
