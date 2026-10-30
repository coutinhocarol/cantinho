/**
 * Leitura e gravação do estado do app nas tabelas relacionais.
 *
 * O front trabalha com o estado inteiro; aqui ele é decomposto em linhas (`replaceState`) e remontado
 * (`loadState`), dentro de uma transação. Toda consulta é filtrada por `user_id`.
 */
import type { Sql } from 'postgres'
import type { AppStateInput, EventInput, RoutineInput } from './schemas'

export class StateError extends Error {}

/** Referência a uma foto dentro do texto da nota. */
export const IMG_REF = /\[\[img:([A-Za-z0-9-]{1,64})\]\]/g

const LIST_NAMES = ['indicacoes', 'hobbies', 'compras'] as const

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
function intervalDays(p: RoutineInput['period']): number {
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

  const routineIds = new Set<string>()
  for (const a of st.areas) {
    for (const r of a.routines) {
      if (routineIds.has(r.id)) throw new StateError(`A rotina '${r.id}' aparece mais de uma vez`)
      routineIds.add(r.id)
      if (a.routines.length > 1 && !r.name?.trim())
        throw new StateError(`A área '${a.id}' tem mais de uma rotina: todas precisam de nome`)
    }
  }

  /** Apaga as linhas do usuário cujo id não veio no estado. */
  const prune = async (table: 'tasks' | 'events' | 'areas' | 'routines' | 'notes' | 'list_items', keep: Set<string>) => {
    const rows = await tx<{ id: string }[]>`select id from ${tx(table)} where user_id = ${userId}`
    const gone = rows.map((r) => r.id).filter((id) => !keep.has(id))
    if (gone.length) await tx`delete from ${tx(table)} where user_id = ${userId} and id in ${tx(gone)}`
  }
  await prune('tasks', new Set(st.tasks.map((t) => t.id)))
  await prune('events', eventIds)
  await prune('areas', areaIds)
  await prune('routines', routineIds)
  await prune('notes', new Set(st.notes.map((n) => n.id)))

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

  // áreas
  for (const [order, a] of st.areas.entries()) {
    await tx`insert into areas (user_id, id, name, emoji, accepts_tasks, sort_order, created_at)
      values (${userId}, ${a.id}, ${a.name}, ${a.emoji ?? ''},
        ${a.acceptsTasks !== false}, ${order}, ${ts(a.createdAt) ?? new Date()})
      on conflict (user_id, id) do update set name = excluded.name, emoji = excluded.emoji,
        accepts_tasks = excluded.accepts_tasks, sort_order = excluded.sort_order,
        created_at = excluded.created_at`
  }

  // rotinas (o array de dias da semana é enviado como texto e convertido no SQL)
  for (const a of st.areas) {
    for (const [order, r] of a.routines.entries()) {
      const weekly = r.period.type === 'weekly'
      const days = weekly ? pgIntArray(r.period.days ?? []) : null
      const time = weekly ? (clockTime(r.period.time) ?? '21:00') : null
      await tx`insert into routines (user_id, id, area_id, name, period_type, interval_days, weekly_days,
          weekly_time, last_done, force_due, sort_order, created_at)
        values (${userId}, ${r.id}, ${a.id}, ${r.name?.trim() ?? ''},
          ${weekly ? 'weekly' : 'interval'}, ${weekly ? null : intervalDays(r.period)},
          ${days}::smallint[], ${time}::time, ${ts(r.lastDone)}, ${ts(r.forceDue)},
          ${order}, ${ts(r.createdAt) ?? new Date()})
        on conflict (user_id, id) do update set area_id = excluded.area_id, name = excluded.name,
          period_type = excluded.period_type, interval_days = excluded.interval_days,
          weekly_days = excluded.weekly_days, weekly_time = excluded.weekly_time,
          last_done = excluded.last_done, force_due = excluded.force_due,
          sort_order = excluded.sort_order, created_at = excluded.created_at`
    }
  }
  await tx`delete from area_checks where user_id = ${userId}`
  const checks = st.areas.flatMap((a) =>
    a.routines.flatMap((r) =>
      [...new Set(r.history ?? [])].map((h) => ({ user_id: userId, routine_id: r.id, checked_at: new Date(h) })),
    ),
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
  // só as listas atuais: linhas de listas que saíram do app (ex.: compras) ficam intactas
  const keepItems = new Set(items.map((i) => i.id))
  const itemRows = await tx<{ id: string }[]>`select id from list_items
    where user_id = ${userId} and list_name in ${tx([...LIST_NAMES])}`
  const goneItems = itemRows.map((r) => r.id).filter((id) => !keepItems.has(id))
  if (goneItems.length) await tx`delete from list_items where user_id = ${userId} and id in ${tx(goneItems)}`
  if (items.length)
    await tx`insert into list_items ${tx(items)}
      on conflict (user_id, id) do update set list_name = excluded.list_name, title = excluded.title,
        kind = excluded.kind, note = excluded.note, created_at = excluded.created_at`

  // notas
  const noteRows = st.notes.map((n) => ({
    user_id: userId,
    id: n.id,
    title: n.title,
    body: n.body,
    created_at: ts(n.createdAt) ?? new Date(),
    updated_at: ts(n.updatedAt) ?? ts(n.createdAt) ?? new Date(),
  }))
  if (noteRows.length)
    await tx`insert into notes ${tx(noteRows)}
      on conflict (user_id, id) do update set title = excluded.title, body = excluded.body,
        created_at = excluded.created_at, updated_at = excluded.updated_at`

  // fotos que nenhuma nota usa mais (as de menos de um dia ficam: podem estar à espera do próximo salvamento)
  const used = [...new Set(st.notes.flatMap((n) => [...n.body.matchAll(IMG_REF)].map((m) => m[1])))]
  if (used.length)
    await tx`delete from note_images where user_id = ${userId} and id not in ${tx(used)}
      and created_at < now() - interval '1 day'`
  else await tx`delete from note_images where user_id = ${userId} and created_at < now() - interval '1 day'`

  // compromissos que passaram sem ser marcados (aguardam confirmação de exclusão)
  await tx`delete from missed_events where user_id = ${userId}`
  const missedRows = st.missed.map((m) => ({
    user_id: userId,
    id: m.id,
    event_id: m.eventId,
    title: m.title,
    date: isoDate(m.date),
    all_day: !!m.allDay,
    start_time: m.allDay ? null : clockTime(m.start),
    end_time: m.allDay ? null : clockTime(m.end),
    repeat: m.repeat || 'none',
    notes: m.notes ?? '',
    task_ids: tx.json(m.taskIds ?? []),
  }))
  if (missedRows.length) await tx`insert into missed_events ${tx(missedRows)} on conflict (user_id, id) do nothing`

  // dia da última repriorização das tarefas
  await tx`insert into user_state (user_id, reprio_day) values (${userId}, ${isoDate(st.reprioDate)})
    on conflict (user_id) do update set reprio_day = excluded.reprio_day`

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
  const [areas, routines, checks, tasks, events, doneDates, items, notes, missed, [userState]] = await Promise.all([
    tx<Record<string, any>[]>`select id, name, emoji, accepts_tasks, sort_order,
        ${tx.unsafe(ms('created_at'))} as created_at
      from areas where user_id = ${userId} order by sort_order, created_at`,
    tx<Record<string, any>[]>`select id, area_id, name, period_type, interval_days,
        to_json(weekly_days) as weekly_days, ${tx.unsafe(hhmm('weekly_time'))} as weekly_time,
        ${tx.unsafe(ms('last_done'))} as last_done, ${tx.unsafe(ms('force_due'))} as force_due,
        ${tx.unsafe(ms('created_at'))} as created_at
      from routines where user_id = ${userId} order by sort_order, created_at`,
    tx<{ routine_id: string; at: number }[]>`select routine_id, ${tx.unsafe(ms('checked_at'))} as at
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
    tx<Record<string, any>[]>`select id, title, body, ${tx.unsafe(ms('created_at'))} as created_at,
        ${tx.unsafe(ms('updated_at'))} as updated_at
      from notes where user_id = ${userId} order by created_at, id`,
    tx<Record<string, any>[]>`select id, event_id, title, ${tx.unsafe(iso('date'))} as date, all_day,
        ${tx.unsafe(hhmm('start_time'))} as start_time, ${tx.unsafe(hhmm('end_time'))} as end_time,
        repeat, notes, task_ids
      from missed_events where user_id = ${userId} order by date, id`,
    tx<{ reprio_day: string | null }[]>`select ${tx.unsafe(iso('reprio_day'))} as reprio_day
      from user_state where user_id = ${userId}`,
  ])
  if (!userState) return null

  const history = new Map<string, number[]>()
  for (const c of checks) history.set(c.routine_id, [...(history.get(c.routine_id) ?? []), Math.round(c.at)])
  const byArea = new Map<string, Record<string, any>[]>()
  for (const r of routines) byArea.set(r.area_id, [...(byArea.get(r.area_id) ?? []), r])
  const done = new Map<string, string[]>()
  for (const d of doneDates) done.set(d.event_id, [...(done.get(d.event_id) ?? []), d.d])

  const lists: Record<string, Record<string, unknown>[]> = {
    indicacoes: [],
    hobbies: [],
    compras: [],
  }
  for (const i of items) {
    lists[i.list_name]?.push({
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
      routines: (byArea.get(a.id) ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        period:
          r.period_type === 'interval'
            ? { type: 'interval', every: r.interval_days, unit: 'days' }
            : { type: 'weekly', days: r.weekly_days ?? [], time: r.weekly_time ?? '' },
        lastDone: round(r.last_done),
        history: history.get(r.id) ?? [],
        createdAt: round(r.created_at),
        ...(r.force_due != null ? { forceDue: round(r.force_due) } : {}),
      })),
      createdAt: round(a.created_at),
      order: a.sort_order,
      acceptsTasks: a.accepts_tasks,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      areaId: t.area_id ?? '',
      quad: t.quad ?? '',
      notes: t.notes,
      due: t.due ?? '',
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
    lists,
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: round(n.created_at),
      updatedAt: round(n.updated_at),
    })),
    missed: missed.map((m) => ({
      id: m.id,
      eventId: m.event_id,
      title: m.title,
      date: m.date,
      allDay: m.all_day,
      start: m.start_time ?? '',
      end: m.end_time ?? '',
      repeat: m.repeat,
      notes: m.notes,
      taskIds: m.task_ids ?? [],
    })),
    reprioDate: userState?.reprio_day ?? '',
  }
}
