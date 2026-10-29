import type { Area, AppState, AreaStatus, Period, Quad, QuadId, Routine } from './types'
import { DAY, WD, WD_FULL, atTime, clamp } from './time'

export const QUADS: Quad[] = [
  { id: 'fazer', n: 1, title: 'Fazer', sub: 'Executar o quanto antes' },
  { id: 'agendar', n: 2, title: 'Agendar', sub: 'Definir dia e horário' },
  { id: 'delegar', n: 3, title: 'Simplificar', sub: 'Fazer com menos esforço' },
  { id: 'eliminar', n: 4, title: 'Eliminar', sub: 'Remover ou limitar' },
]
export const quadById = (id: QuadId | '' | undefined) => QUADS.find((q) => q.id === id)

export function periodText(p: Period | null | undefined): string {
  if (!p) return ''
  if (p.type === 'interval') {
    return p.every == 1 ? 'Todo dia' : `A cada ${p.every} dias`
  }
  if (p.type === 'weekly') {
    const d = [...(p.days || [])].sort()
    if (!d.length) return 'Escolha os dias'
    if (d.length === 7) return `Todo dia às ${p.time}`
    if (d.length === 1) {
      const w = WD_FULL[d[0]]
      return `${d[0] === 0 || d[0] === 6 ? 'Todo' : 'Toda'} ${w} às ${p.time}`
    }
    const names = d.map((i) => WD[i])
    return `${names.slice(0, -1).join(', ')} e ${names.at(-1)} às ${p.time}`
  }
  return ''
}

function occurrences(p: Period, now: number): number[] {
  const out: number[] = []
  if (p.type === 'weekly') {
    for (let i = -8; i <= 8; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      if ((p.days || []).includes(d.getDay())) out.push(atTime(d, p.time))
    }
  }
  return out.sort((a, b) => a - b)
}

/** Situação de uma rotina: pendente ("A checar"), progresso 0..1 e próximos marcos. */
export function routineStatus(r: Routine, now = Date.now()): AreaStatus {
  const p = r.period
  if (r.forceDue) return { due: true, progress: 1, since: r.forceDue, forced: true }
  const last = r.lastDone || null
  if (p.type === 'interval') {
    const ms = DAY * Math.max(1, p.every || 1)
    if (!last) return { due: true, progress: 1, never: true }
    const next = last + ms
    return {
      due: now >= next,
      progress: clamp((now - last) / ms),
      nextAt: next,
      since: now >= next ? next : null,
    }
  }
  if (p.type === 'weekly' && !(p.days || []).length) return { due: false, progress: 0, invalid: true }
  const occ = occurrences(p, now)
  let prev: number | null = null
  let next: number | null = null
  for (const t of occ) {
    if (t <= now) prev = t
    else if (next == null) next = t
  }
  const covered = prev == null || (last ? last >= prev : (r.createdAt || 0) >= prev)
  const due = !covered
  const start = prev ?? (last || r.createdAt || now)
  const progress = due ? 1 : next ? clamp((now - start) / (next - start)) : 0
  return { due, progress, nextAt: due ? prev : next, since: due ? prev : null }
}

/** Nome mostrado de uma rotina: o da área, seguido do nome da rotina quando a área tem várias. */
export const routineLabel = (a: Area, r: Routine): string =>
  a.routines.length > 1 && r.name ? `${a.name} · ${r.name}` : a.name

export const areaDue = (a: Area, now = Date.now()): boolean =>
  a.routines.some((r) => routineStatus(r, now).due)

export const routineById = (a: Area | undefined, id: string): Routine | undefined =>
  a?.routines.find((r) => r.id === id)

export const sortedAreas = (s: AppState): Area[] =>
  [...s.areas].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
export const areaById = (s: AppState, id: string | undefined) => s.areas.find((a) => a.id === id)
export const acceptsTasks = (a: Area) => a.acceptsTasks !== false
export const taskAreas = (s: AppState) => sortedAreas(s).filter(acceptsTasks)
