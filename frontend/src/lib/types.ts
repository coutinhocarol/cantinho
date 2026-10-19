export type QuadId = 'fazer' | 'agendar' | 'delegar' | 'eliminar'
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
export type ListId = 'compras' | 'indicacoes' | 'hobbies'
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
  color?: string
  period: Period
  lastDone: number | null
  history: number[]
  createdAt: number
  order: number
  acceptsTasks?: boolean
  forceDue?: number
  okAt?: number
}

export interface Task {
  id: string
  title: string
  areaId: string
  notes: string
  due: string
  quad?: QuadId | ''
  done: boolean
  doneAt: number | null
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
