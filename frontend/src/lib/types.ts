export type QuadId = 'fazer' | 'agendar' | 'delegar' | 'eliminar'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type ListId = 'indicacoes' | 'hobbies'
export type KindId = 'filme' | 'serie' | 'livro' | 'outro'

interface IntervalPeriod {
  type: 'interval'
  every: number
  unit: string
}
interface WeeklyPeriod {
  type: 'weekly'
  days: number[]
  time: string
}
export type Period = IntervalPeriod | WeeklyPeriod

export interface Area {
  id: string
  name: string
  emoji: string
  period: Period
  lastDone: number | null
  history: number[]
  createdAt: number
  order: number
  acceptsTasks?: boolean
  forceDue?: number
}

export interface Task {
  id: string
  title: string
  areaId: string
  notes: string
  due: string
  quad?: QuadId | ''
  createdAt: number
  eventId?: string
}

export interface CalEvent {
  id: string
  title: string
  date: string
  allDay: boolean
  start: string
  end: string
  repeat: Repeat
  notes: string
  createdAt: number
  origin?: string
  doneDates?: string[]
}

/** Compromisso (ou ocorrência de um que se repete) que passou sem ser marcado como feito. */
export interface MissedEvent {
  /** `${id do compromisso}:${data}`: igual em qualquer aparelho, evita duplicar. */
  id: string
  eventId: string
  title: string
  date: string
  allDay: boolean
  start: string
  end: string
  repeat: Repeat
  notes: string
  /** Tarefas que estavam ligadas ao compromisso quando ele foi recolhido. */
  taskIds: string[]
}

export interface ListItem {
  id: string
  title: string
  createdAt: number
  kind?: KindId | ''
  note?: string
}

interface Water {
  goal: number
  date: string
  count: number
  v2: boolean
}

export interface AppState {
  v: number
  areas: Area[]
  tasks: Task[]
  events: CalEvent[]
  water: Water
  lists: Record<ListId, ListItem[]>
  missed: MissedEvent[]
  /** Último dia (aaaa-mm-dd) em que as tarefas foram repriorizadas na matriz. */
  reprioDate: string
}

export interface Quad {
  id: QuadId
  n: number
  title: string
  sub: string
}

export interface AreaStatus {
  due: boolean
  progress: number
  nextAt?: number | null
  since?: number | null
  never?: boolean
  forced?: boolean
  invalid?: boolean
}
