/**
 * Leitura e gravação do estado do app nas tabelas relacionais.
 *
 * O front trabalha com o estado inteiro; aqui ele é decomposto em linhas (`replaceState`) e remontado
 * (`loadState`), dentro de uma transação. Toda consulta é filtrada por `user_id`.
 */
import type { Sql } from 'postgres'
import type { AppStateInput, AreaInput, EventInput } from './schemas'

export class StateError extends Error {}

const LIST_NAMES = ['compras', 'indicacoes', 'hobbies'] as const

// ---------- conversões ----------
const ts = (ms: number | null | undefined) => (ms == null ? null : new Date(ms))

function isoDate(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(`${v}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    throw new StateError(`Data inválida: ${JSON.stringify(v)}`)
  return v
}

function clockTime(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v)
  if (!m || +m[1] > 23 || +m[2] > 59) throw new StateError(`Horário inválido: ${JSON.stringify(v)}`)
  return `${m[1]}:${m[2]}`
}

/** Períodos antigos (mensal, semanas, horas) viram "a cada X dias". */
function intervalDays(p: AreaInput['period']): number {
  if (p.type === 'monthly') return 30
  let every = Math.trunc(p.every || 1)
  if (p.unit === 'weeks') every *= 7
  else if (p.unit === 'hours') every = Math.ceil(every / 24)
  return Math.max(1, every)
}

const pgIntArray = (xs: number[]) => `{${xs.map((x) => Math.trunc(x)).join(',')}}`
const ms = (col: string) => `(extract(epoch from ${col}) * 1000)::float8`

// ---------- gravação ----------
export async function replaceState(tx: Sql, userId: string, st: AppStateInput): Promise<void> {
  const areaIds = new Set(st.areas.map((a) => a.id))
  const eventIds = new Set(st.events.map((e) => e.id))
  for (const t of st.tasks) {
    if (t.areaId && !areaIds.has(t.areaId))
      throw new StateError(`A tarefa '${t.id}' aponta para uma área que não existe`)
  }

  /** Apaga as linhas do usuário cujo id não veio no estado. */
  const prune = async (table: 'tasks' | 'events' | 'areas' | 'list_items', keep: Set<string>) => {
    const rows = await tx<{ id: string }[]>`select id from ${tx(table)} where user_id = ${userId}`
    const gone = rows.map((r) => r.id).filter((id) => !keep.has(id))
    if (gone.length) await tx`delete from ${tx(table)} where user_id = ${userId} and id in ${tx(gone)}`
  }
  await prune('tasks', new Set(st.tasks.map((t) => t.id)))
  await prune('events', eventIds)
  await prune('areas', areaIds)

  // compromissos
  const eventRows = st.events.map((e) => eventRow(userId, e))
  if (eventRows.length)
    await tx`insert into events ${tx(eventRows)}
      on conflict (user_id, id) do update set title = excluded.title, date = excluded.date,
        origin = excluded.origin, all_day = excluded.all_day, start_time = excluded.start_time,
        end_time = excluded.end_time, repeat = excluded.repeat, notes = excluded.notes,
        created_at = excluded.created_at`
  await tx`delete from event_done_dates where user_id = ${userId}`
  const done = st.events.flatMap((e) =>
    [...new Set((e.doneDates ?? []).map(isoDate).filter((d): d is string => !!d))].map((d) => ({
      user_id: userId,
      event_id: e.id,
      done_date: d,
    })),
  )
  if (done.length) await tx`insert into event_done_dates ${tx(done)}`

  // áreas (o array de dias da semana é enviado como texto e convertido no SQL)
  for (const [order, a] of st.areas.entries()) {
    const weekly = a.period.type === 'weekly'
    const days = weekly ? pgIntArray(a.period.days ?? []) : null
    const time = weekly ? (clockTime(a.period.time) ?? '21:00') : null
    await tx`insert into areas (user_id, id, name, emoji, color, period_type, interval_days, weekly_days,
        weekly_time, last_done, ok_at, force_due, accepts_tasks, sort_order, created_at)
      values (${userId}, ${a.id}, ${a.name}, ${a.emoji ?? ''}, ${a.color ?? null},
        ${weekly ? 'weekly' : 'interval'}, ${weekly ? null : intervalDays(a.period)},
        ${days}::smallint[], ${time}::time, ${ts(a.lastDone)}, ${ts(a.okAt)}, ${ts(a.forceDue)},
        ${a.acceptsTasks !== false}, ${order}, ${ts(a.createdAt) ?? new Date()})
      on conflict (user_id, id) do update set name = excluded.name, emoji = excluded.emoji,
        color = excluded.color, period_type = excluded.period_type,
        interval_days = excluded.interval_days, weekly_days = excluded.weekly_days,
        weekly_time = excluded.weekly_time, last_done = excluded.last_done, ok_at = excluded.ok_at,
        force_due = excluded.force_due, accepts_tasks = excluded.accepts_tasks,
        sort_order = excluded.sort_order, created_at = excluded.created_at`
  }
  await tx`delete from area_checks where user_id = ${userId}`
  const checks = st.areas.flatMap((a) =>
    [...new Set(a.history ?? [])].map((h) => ({ user_id: userId, area_id: a.id, checked_at: new Date(h) })),
  )
  if (checks.length) await tx`insert into area_checks ${tx(checks)}`

  // tarefas (podem ficar sem área; o compromisso some da ligação se não existir mais)
  const taskRows = st.tasks.map((t) => ({
    user_id: userId,
    id: t.id,
    title: t.title,
    area_id: t.areaId || null,
    event_id: t.eventId && eventIds.has(t.eventId) ? t.eventId : null,
    quad: t.quad || null,
    due: isoDate(t.due),
    notes: t.notes ?? '',
    created_at: ts(t.createdAt) ?? new Date(),
  }))
  if (taskRows.length)
    await tx`insert into tasks ${tx(taskRows)}
      on conflict (user_id, id) do update set title = excluded.title, area_id = excluded.area_id,
        event_id = excluded.event_id, quad = excluded.quad, due = excluded.due,
        notes = excluded.notes, created_at = excluded.created_at`

  // listas
  const items = LIST_NAMES.flatMap((name) =>
    st.lists[name].map((it) => ({
      user_id: userId,
      id: it.id,
      list_name: name,
      title: it.title,
      kind: it.kind || null,
      note: it.note || null,
      created_at: ts(it.createdAt) ?? new Date(),
    })),
  )
  await prune('list_items', new Set(items.map((i) => i.id)))
  if (items.length)
    await tx`insert into list_items ${tx(items)}
      on conflict (user_id, id) do update set list_name = excluded.list_name, title = excluded.title,
        kind = excluded.kind, note = excluded.note, created_at = excluded.created_at`

  // água
  const goal = Math.max(1, Math.min(30, Math.trunc(st.water.goal)))
  await tx`insert into water (user_id, goal, day, count)
    values (${userId}, ${goal}, ${isoDate(st.water.date)}, ${Math.max(0, Math.trunc(st.water.count))})
    on conflict (user_id) do update set goal = excluded.goal, day = excluded.day, count = excluded.count`
}

function eventRow(userId: string, e: EventInput) {
  const date = isoDate(e.date)
  if (!date) throw new StateError(`Compromisso '${e.id}' sem data`)
  const allDay = !!e.allDay
  const start = allDay ? null : clockTime(e.start)
  if (!allDay && !start)
    throw new StateError(`Compromisso '${e.id}' precisa de horário de início ou ser de dia inteiro`)
  return {
    user_id: userId,
    id: e.id,
    title: e.title,
    date,
    origin: isoDate(e.origin) ?? date,
    all_day: allDay,
    start_time: start,
    end_time: allDay ? null : clockTime(e.end),
    repeat: e.repeat || 'none',
    notes: e.notes ?? '',
    created_at: ts(e.createdAt) ?? new Date(),
  }
}

// ---------- leitura ----------
const iso = (col: string) => `to_char(${col}, 'YYYY-MM-DD')`
const hhmm = (col: string) => `to_char(${col}, 'HH24:MI')`
const round = (v: number | null) => (v == null ? null : Math.round(v))

/** Estado completo no formato do app, ou `null` se nada foi salvo ainda. */
export async function loadState(tx: Sql, userId: string) {
  const [water] = await tx<{ goal: number; day: string | null; count: number }[]>`
    select goal, ${tx.unsafe(iso('day'))} as day, count from water where user_id = ${userId}`
  if (!water) return null

  const [areas, checks, tasks, events, doneDates, items] = await Promise.all([
    tx<Record<string, any>[]>`select id, name, emoji, color, period_type, interval_days,
        to_json(weekly_days) as weekly_days, ${tx.unsafe(hhmm('weekly_time'))} as weekly_time,
        ${tx.unsafe(ms('last_done'))} as last_done, ${tx.unsafe(ms('ok_at'))} as ok_at,
        ${tx.unsafe(ms('force_due'))} as force_due, accepts_tasks, sort_order,
        ${tx.unsafe(ms('created_at'))} as created_at
      from areas where user_id = ${userId} order by sort_order, created_at`,
    tx<{ area_id: string; at: number }[]>`select area_id, ${tx.unsafe(ms('checked_at'))} as at
      from area_checks where user_id = ${userId} order by checked_at desc`,
    tx<Record<string, any>[]>`select id, title, area_id, event_id, quad, ${tx.unsafe(iso('due'))} as due,
        notes, ${tx.unsafe(ms('created_at'))} as created_at
      from tasks where user_id = ${userId} order by created_at, id`,
    tx<Record<string, any>[]>`select id, title, ${tx.unsafe(iso('date'))} as date,
        ${tx.unsafe(iso('origin'))} as origin, all_day, ${tx.unsafe(hhmm('start_time'))} as start_time,
        ${tx.unsafe(hhmm('end_time'))} as end_time, repeat, notes, ${tx.unsafe(ms('created_at'))} as created_at
      from events where user_id = ${userId} order by created_at, id`,
    tx<{ event_id: string; d: string }[]>`select event_id, ${tx.unsafe(iso('done_date'))} as d
      from event_done_dates where user_id = ${userId} order by done_date`,
    tx<Record<string, any>[]>`select id, list_name, title, kind, note, ${tx.unsafe(ms('created_at'))} as created_at
      from list_items where user_id = ${userId} order by created_at, id`,
  ])

  const history = new Map<string, number[]>()
  for (const c of checks) history.set(c.area_id, [...(history.get(c.area_id) ?? []), Math.round(c.at)])
  const done = new Map<string, string[]>()
  for (const d of doneDates) done.set(d.event_id, [...(done.get(d.event_id) ?? []), d.d])

  const lists: Record<string, Record<string, unknown>[]> = { compras: [], indicacoes: [], hobbies: [] }
  for (const i of items) {
    lists[i.list_name].push({
      id: i.id,
      title: i.title,
      createdAt: round(i.created_at),
      ...(i.kind ? { kind: i.kind } : {}),
      ...(i.note ? { note: i.note } : {}),
    })
  }

  return {
    v: 1,
    areas: areas.map((a) => ({
      id: a.id,
      name: a.name,
      emoji: a.emoji,
      period:
        a.period_type === 'interval'
          ? { type: 'interval', every: a.interval_days, unit: 'days' }
          : { type: 'weekly', days: a.weekly_days ?? [], time: a.weekly_time ?? '' },
      lastDone: round(a.last_done),
      history: history.get(a.id) ?? [],
      createdAt: round(a.created_at),
      order: a.sort_order,
      acceptsTasks: a.accepts_tasks,
      ...(a.color ? { color: a.color } : {}),
      ...(a.ok_at != null ? { okAt: round(a.ok_at) } : {}),
      ...(a.force_due != null ? { forceDue: round(a.force_due) } : {}),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      areaId: t.area_id ?? '',
      quad: t.quad ?? '',
      notes: t.notes,
      due: t.due ?? '',
      done: false,
      doneAt: null,
      createdAt: round(t.created_at),
      ...(t.event_id ? { eventId: t.event_id } : {}),
    })),
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      origin: e.origin,
      allDay: e.all_day,
      start: e.start_time ?? '',
      end: e.end_time ?? '',
      repeat: e.repeat,
      notes: e.notes,
      doneDates: done.get(e.id) ?? [],
      createdAt: round(e.created_at),
    })),
    water: { goal: water.goal, date: water.day ?? '', count: water.count, v2: true },
    lists,
  }
}
