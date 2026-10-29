/**
 * Formato do estado do Cantinho trocado com o app (validação da entrada da API).
 * Campos que o banco não guarda (ex.: `v`) são ignorados.
 */
import { z } from 'zod'

const MAX_ITEMS = 10_000
const num = z.number().finite()
const opt = <T extends z.ZodType>(t: T) => t.nullish()

const Period = z.object({
  type: z.string(),
  every: opt(num),
  unit: opt(z.string()),
  days: opt(z.array(z.number().int().min(0).max(6))),
  time: opt(z.string()),
})

const Routine = z.object({
  id: z.string().min(1).max(64),
  name: opt(z.string()),
  period: Period,
  lastDone: opt(num),
  history: opt(z.array(num)),
  createdAt: opt(num),
  forceDue: opt(num),
})

const Area = z.object({
  id: z.string().min(1).max(64),
  name: z.string(),
  routines: z.array(Routine).min(1).max(50),
  emoji: opt(z.string()),
  createdAt: opt(num),
  order: opt(num),
  acceptsTasks: opt(z.boolean()),
})

const Task = z.object({
  id: z.string().min(1).max(64),
  title: z.string(),
  areaId: opt(z.string()),
  notes: opt(z.string()),
  due: opt(z.string()),
  quad: opt(z.string()),
  createdAt: opt(num),
  eventId: opt(z.string()),
})

const CalEvent = z.object({
  id: z.string().min(1).max(64),
  title: z.string(),
  date: z.string(),
  allDay: opt(z.boolean()),
  start: opt(z.string()),
  end: opt(z.string()),
  repeat: opt(z.string()),
  notes: opt(z.string()),
  createdAt: opt(num),
  origin: opt(z.string()),
  doneDates: opt(z.array(z.string())),
})

const ListItem = z.object({
  id: z.string().min(1).max(64),
  title: z.string(),
  createdAt: opt(num),
  kind: opt(z.string()),
  note: opt(z.string()),
})

const MissedEvent = z.object({
  id: z.string().min(1).max(64),
  eventId: z.string().min(1).max(64),
  title: z.string(),
  date: z.string(),
  allDay: opt(z.boolean()),
  start: opt(z.string()),
  end: opt(z.string()),
  repeat: opt(z.string()),
  notes: opt(z.string()),
  taskIds: opt(z.array(z.string())),
})

const list = <T extends z.ZodType>(t: T) => z.array(t).max(MAX_ITEMS).default([])

export const AppStateSchema = z.object({
  v: z.number().default(1),
  areas: list(Area),
  tasks: list(Task),
  events: list(CalEvent),
  lists: z
    .object({
      indicacoes: list(ListItem),
      hobbies: list(ListItem),
      compras: list(ListItem),
    })
    .default({ indicacoes: [], hobbies: [], compras: [] }),
  missed: list(MissedEvent),
  reprioDate: z.string().nullish(),
})

export type AppStateInput = z.infer<typeof AppStateSchema>
export type AreaInput = z.infer<typeof Area>
export type RoutineInput = z.infer<typeof Routine>
type TaskInput = z.infer<typeof Task>
export type EventInput = z.infer<typeof CalEvent>

export const Credentials = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9._-]+$/),
  password: z.string().min(1).max(128),
})
export const Registration = Credentials.extend({ password: z.string().min(8).max(128) })
