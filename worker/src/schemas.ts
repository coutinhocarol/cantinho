/**
 * Formato do estado do Cantinho trocado com o app (validação da entrada da API).
 * Campos que o banco não guarda (ex.: `v`, `done` de tarefa) são ignorados.
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

const Area = z.object({
  id: z.string().min(1).max(64),
  name: z.string(),
  period: Period,
  emoji: opt(z.string()),
  color: opt(z.string().max(16)),
  lastDone: opt(num),
  history: opt(z.array(num)),
  createdAt: opt(num),
  order: opt(num),
  acceptsTasks: opt(z.boolean()),
  forceDue: opt(num),
  okAt: opt(num),
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

const list = <T extends z.ZodType>(t: T) => z.array(t).max(MAX_ITEMS).default([])

export const AppStateSchema = z.object({
  v: z.number().default(1),
  areas: list(Area),
  tasks: list(Task),
  events: list(CalEvent),
  water: z
    .object({
      goal: num.default(10),
      date: z.string().default(''),
      count: num.default(0),
      v2: z.boolean().default(true),
    })
    .default({ goal: 10, date: '', count: 0, v2: true }),
  lists: z
    .object({
      compras: list(ListItem),
      indicacoes: list(ListItem),
      hobbies: list(ListItem),
    })
    .default({ compras: [], indicacoes: [], hobbies: [] }),
})

export type AppStateInput = z.infer<typeof AppStateSchema>
export type AreaInput = z.infer<typeof Area>
export type TaskInput = z.infer<typeof Task>
export type EventInput = z.infer<typeof CalEvent>

export const Credentials = z.object({
  email: z.string().trim().max(320).email(),
  password: z.string().min(1).max(128),
})
export const Registration = Credentials.extend({ password: z.string().min(8).max(128) })
