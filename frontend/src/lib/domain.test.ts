import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { areaStatus, periodText } from './areas'
import { eventsOn, occursOn, pruneEvents } from './events'
import { emptyState, hasData, mergeLocalInto, normalize, waterCount, waterGoal } from './state'
import type { Area, AppState, CalEvent } from './types'
import { DAY, firstChar, rel, ymd } from './time'

// Quarta-feira, 21/10/2026, meio-dia
const NOW = new Date(2026, 9, 21, 12, 0, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

const area = (over: Partial<Area> = {}): Area => ({
  id: 'a1',
  name: 'Quarto',
  emoji: '🛏️',
  period: { type: 'interval', every: 7, unit: 'days' },
  lastDone: null,
  history: [],
  createdAt: NOW.getTime() - 30 * DAY,
  order: 0,
  ...over,
})

const ev = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: 'e1',
  title: 'Yoga',
  date: '2026-10-21',
  allDay: false,
  start: '19:00',
  end: '20:00',
  repeat: 'none',
  notes: '',
  createdAt: 0,
  ...over,
})

describe('periodText', () => {
  it('descreve intervalos', () => {
    expect(periodText({ type: 'interval', every: 1, unit: 'days' })).toBe('Todo dia')
    expect(periodText({ type: 'interval', every: 3, unit: 'days' })).toBe('A cada 3 dias')
  })
  it('descreve dias da semana', () => {
    expect(periodText({ type: 'weekly', days: [], time: '21:00' })).toBe('Escolha os dias')
    expect(periodText({ type: 'weekly', days: [2], time: '21:00' })).toBe('Toda terça às 21:00')
    expect(periodText({ type: 'weekly', days: [0], time: '09:00' })).toBe('Todo domingo às 09:00')
    expect(periodText({ type: 'weekly', days: [6], time: '09:00' })).toBe('Todo sábado às 09:00')
    expect(periodText({ type: 'weekly', days: [3, 1], time: '08:00' })).toBe('Seg e Qua às 08:00')
    expect(periodText({ type: 'weekly', days: [1, 3, 5], time: '08:00' })).toBe('Seg, Qua e Sex às 08:00')
    expect(periodText({ type: 'weekly', days: [0, 1, 2, 3, 4, 5, 6], time: '10:00' })).toBe(
      'Todo dia às 10:00',
    )
  })
})

describe('areaStatus (a cada X dias)', () => {
  it('área nunca checada fica pendente', () => {
    const st = areaStatus(area(), NOW.getTime())
    expect(st).toMatchObject({ due: true, never: true, progress: 1 })
  })
  it('vence X dias depois da última checagem', () => {
    const last = NOW.getTime() - 8 * DAY
    const st = areaStatus(area({ lastDone: last }), NOW.getTime())
    expect(st.due).toBe(true)
    expect(st.since).toBe(last + 7 * DAY)
  })
  it('em dia mostra progresso e a próxima data', () => {
    const last = NOW.getTime() - DAY
    const st = areaStatus(area({ lastDone: last }), NOW.getTime())
    expect(st.due).toBe(false)
    expect(st.progress).toBeCloseTo(1 / 7)
    expect(st.nextAt).toBe(last + 7 * DAY)
  })
  it('"mandar pra checar" força pendência', () => {
    const t = NOW.getTime() - 1000
    const st = areaStatus(area({ lastDone: NOW.getTime(), forceDue: t }), NOW.getTime())
    expect(st).toMatchObject({ due: true, forced: true, since: t })
  })
  it('dispensar a checagem (okAt) conta como checada', () => {
    const st = areaStatus(area({ lastDone: NOW.getTime() - 20 * DAY, okAt: NOW.getTime() }), NOW.getTime())
    expect(st.due).toBe(false)
  })
})

describe('areaStatus (dias da semana)', () => {
  const weekly = (over: Partial<Area> = {}) =>
    area({ period: { type: 'weekly', days: [2], time: '21:00' }, ...over })

  it('sem dias definidos é inválida', () => {
    const st = areaStatus(area({ period: { type: 'weekly', days: [], time: '21:00' } }))
    expect(st).toMatchObject({ due: false, invalid: true })
  })
  it('fica pendente depois do horário do dia escolhido', () => {
    const tue2100 = new Date(2026, 9, 20, 21, 0).getTime()
    const st = areaStatus(weekly(), NOW.getTime())
    expect(st.due).toBe(true)
    expect(st.since).toBe(tue2100)
  })
  it('checagem depois do horário vale para aquele dia', () => {
    const st = areaStatus(weekly({ lastDone: new Date(2026, 9, 20, 22, 0).getTime() }), NOW.getTime())
    expect(st.due).toBe(false)
    expect(st.nextAt).toBe(new Date(2026, 9, 27, 21, 0).getTime())
  })
  it('checagem antes do horário não vale para aquele dia', () => {
    const st = areaStatus(weekly({ lastDone: new Date(2026, 9, 20, 20, 0).getTime() }), NOW.getTime())
    expect(st.due).toBe(true)
  })
  it('área criada depois do último horário não nasce pendente', () => {
    const st = areaStatus(weekly({ createdAt: new Date(2026, 9, 21, 9, 0).getTime() }), NOW.getTime())
    expect(st.due).toBe(false)
  })
})

describe('occursOn', () => {
  it('não repete: só na data', () => {
    const e = ev()
    expect(occursOn(e, '2026-10-21')).toBe(true)
    expect(occursOn(e, '2026-10-22')).toBe(false)
  })
  it('nunca ocorre antes da data inicial', () => {
    expect(occursOn(ev({ repeat: 'daily' }), '2026-10-20')).toBe(false)
    expect(occursOn(ev({ repeat: 'daily' }), '2026-12-31')).toBe(true)
  })
  it('semanal usa a origem', () => {
    const e = ev({ repeat: 'weekly', origin: '2026-10-21' })
    expect(occursOn(e, '2026-10-28')).toBe(true)
    expect(occursOn(e, '2026-10-27')).toBe(false)
  })
  it('mensal em dia 31 cai no último dia dos meses curtos', () => {
    const e = ev({ repeat: 'monthly', date: '2026-01-31', origin: '2026-01-31' })
    expect(occursOn(e, '2026-02-28')).toBe(true)
    expect(occursOn(e, '2026-03-31')).toBe(true)
    expect(occursOn(e, '2026-03-30')).toBe(false)
  })
  it('anual de 29/02 cai em 28/02 fora de ano bissexto', () => {
    const e = ev({ repeat: 'yearly', date: '2024-02-29', origin: '2024-02-29' })
    expect(occursOn(e, '2027-02-28')).toBe(true)
    expect(occursOn(e, '2028-02-29')).toBe(true)
    expect(occursOn(e, '2028-02-28')).toBe(false)
  })
})

describe('eventsOn', () => {
  it('ordena dia inteiro primeiro, depois por horário e título; esconde concluídos', () => {
    const s = emptyState()
    s.events = [
      ev({ id: 'b', title: 'B', start: '15:00' }),
      ev({ id: 'a', title: 'A', start: '09:00' }),
      ev({ id: 'z', title: 'Z', allDay: true, start: '' }),
      ev({ id: 'd', title: 'D', repeat: 'daily', doneDates: ['2026-10-21'] }),
    ]
    expect(eventsOn(s, '2026-10-21').map((e) => e.id)).toEqual(['z', 'a', 'b'])
  })
})

describe('pruneEvents', () => {
  it('remove compromissos únicos que já passaram', () => {
    const s = emptyState()
    s.events = [ev({ id: 'old', date: '2026-10-20' }), ev({ id: 'today' })]
    expect(pruneEvents(s, NOW)).toBe(true)
    expect(s.events.map((e) => e.id)).toEqual(['today'])
  })
  it('avança compromissos que se repetem para a próxima ocorrência', () => {
    const s = emptyState()
    s.events = [ev({ repeat: 'weekly', date: '2026-10-06', origin: '2026-10-06' })]
    pruneEvents(s, NOW)
    expect(s.events[0].date).toBe('2026-10-27')
    expect(s.events[0].origin).toBe('2026-10-06')
  })
  it('descarta marcações de dias passados', () => {
    const s = emptyState()
    s.events = [
      ev({ repeat: 'daily', origin: '2026-10-01', date: '2026-10-21', doneDates: ['2026-10-10', '2026-10-21'] }),
    ]
    pruneEvents(s, NOW)
    expect(s.events[0].doneDates).toEqual(['2026-10-21'])
  })
  it('remove eventos sem data', () => {
    const s = emptyState()
    s.events = [ev({ date: '' })]
    expect(pruneEvents(s, NOW)).toBe(true)
    expect(s.events).toEqual([])
  })
})

describe('normalize', () => {
  const fresh = (): AppState => {
    const s = emptyState()
    s.water = { goal: 10, date: ymd(NOW), count: 4, v2: true }
    return s
  }

  it('não muda um estado já consistente', () => {
    expect(normalize(fresh(), NOW)).toBe(false)
  })
  it('zera a água na virada do dia', () => {
    const s = fresh()
    s.water.date = '2026-10-20'
    expect(normalize(s, NOW)).toBe(true)
    expect(s.water).toMatchObject({ date: '2026-10-21', count: 0 })
  })
  it('migra a meta de água antiga (sem v2) para 10 copos', () => {
    const s = fresh()
    s.water = { goal: 8, date: ymd(NOW), count: 2, v2: false }
    normalize(s, NOW)
    expect(s.water.goal).toBe(10)
    expect(s.water.v2).toBe(true)
  })
  it('converte períodos antigos para "a cada X dias"', () => {
    const s = fresh()
    const legacy = (period: unknown, id: string) =>
      ({ ...area({ id }), period }) as unknown as Area
    s.areas = [
      legacy({ type: 'monthly' }, 'm'),
      legacy({ type: 'interval', every: 2, unit: 'weeks' }, 'w'),
      legacy({ type: 'interval', every: 48, unit: 'hours' }, 'h'),
    ]
    expect(normalize(s, NOW)).toBe(true)
    expect(s.areas.map((a) => a.period)).toEqual([
      { type: 'interval', every: 30, unit: 'days' },
      { type: 'interval', every: 14, unit: 'days' },
      { type: 'interval', every: 2, unit: 'days' },
    ])
  })
  it('solta o vínculo de tarefa com compromisso que não existe mais', () => {
    const s = fresh()
    s.tasks = [
      { id: 't', title: 'x', areaId: 'a1', notes: '', due: '', done: false, doneAt: null, createdAt: 0, eventId: 'sumiu' },
    ]
    expect(normalize(s, NOW)).toBe(true)
    expect(s.tasks[0].eventId).toBeUndefined()
  })
  it('garante as listas e os eventos', () => {
    const s = fresh()
    ;(s as Partial<AppState>).lists = undefined
    ;(s as Partial<AppState>).events = undefined
    normalize(s, NOW)
    expect(s.lists).toEqual({ compras: [], indicacoes: [], hobbies: [] })
    expect(s.events).toEqual([])
  })
})

describe('água', () => {
  it('meta mínima de 1 e contagem limitada à meta', () => {
    const s = emptyState()
    s.water = { goal: 0, date: ymd(NOW), count: 99, v2: true }
    expect(waterGoal(s)).toBe(10)
    s.water.goal = 5
    expect(waterCount(s, NOW)).toBe(5)
  })
  it('contagem de outro dia vale zero', () => {
    const s = emptyState()
    s.water = { goal: 10, date: '2026-10-20', count: 6, v2: true }
    expect(waterCount(s, NOW)).toBe(0)
  })
})

describe('mergeLocalInto / hasData', () => {
  it('mantém a conta e acrescenta só o que é novo deste aparelho', () => {
    const remote = emptyState()
    remote.areas = [area({ id: 'r', name: 'Da conta' })]
    remote.lists.compras = [{ id: 'c1', title: 'Leite', createdAt: 1 }]
    const local = emptyState()
    local.areas = [area({ id: 'r', name: 'Local diferente' }), area({ id: 'l', name: 'Só aqui' })]
    local.lists.compras = [
      { id: 'c1', title: 'Leite (local)', createdAt: 1 },
      { id: 'c2', title: 'Pão', createdAt: 2 },
    ]
    const out = mergeLocalInto(remote, local)
    expect(out.areas.map((a) => [a.id, a.name])).toEqual([
      ['r', 'Da conta'],
      ['l', 'Só aqui'],
    ])
    expect(out.lists.compras.map((i) => i.id)).toEqual(['c1', 'c2'])
    expect(out.lists.compras[0].title).toBe('Leite')
  })
  it('hasData', () => {
    expect(hasData(emptyState())).toBe(false)
    expect(hasData(null)).toBe(false)
    const s = emptyState()
    s.lists.hobbies.push({ id: 'h', title: 'Cerâmica', createdAt: 0 })
    expect(hasData(s)).toBe(true)
  })
})

describe('time', () => {
  it('firstChar pega o primeiro emoji inteiro', () => {
    expect(firstChar('  🛏️abc')).toBe('🛏️')
    expect(firstChar('👨‍👩‍👧 x')).toBe('👨‍👩‍👧')
    expect(firstChar('')).toBe('')
  })
  it('rel descreve tempo relativo em português', () => {
    const now = NOW.getTime()
    expect(rel(now + 10_000, now)).toBe('agora')
    expect(rel(now - DAY, now)).toBe('ontem')
    expect(rel(now + DAY, now)).toBe('amanhã')
    expect(rel(now - 3 * DAY, now)).toBe('há 3 dias')
    expect(rel(now + 2 * 36e5, now)).toBe('em 2 horas')
  })
})
