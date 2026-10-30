/**
 * Os testes rodam no PostgreSQL do Supabase (o mesmo do app), num schema temporário que é apagado
 * no fim. As tabelas reais do schema `public` não são tocadas.
 */
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'
import type { Sql } from 'postgres'
import { createApp } from '../src/app'
import type { Env } from '../src/app'

export const PW = 'senha-segura-1'

export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL
  if (!raw || raw.includes('[YOUR-PASSWORD]')) throw new Error('Defina DATABASE_URL no .env da raiz')
  return raw.replace(/^postgresql\+\w+:/, 'postgresql:')
}

export interface TestDb {
  sql: Sql
  schema: string
  env: Env
  /** Roda `fn` dentro do schema de testes. */
  run<T>(fn: (t: Sql) => Promise<T>): Promise<T>
  drop(): Promise<void>
}

export async function createTestDb(extra: Partial<Env> = {}): Promise<TestDb> {
  const sql = postgres(databaseUrl(), { max: 4, fetch_types: false, onnotice: () => {} })
  const schema = `test_${randomBytes(6).toString('hex')}`
  await sql.unsafe(`create schema "${schema}"`)
  const run = <T>(fn: (t: Sql) => Promise<T>) =>
    sql.begin(async (t) => {
      await t.unsafe(`set local search_path to "${schema}"`)
      return fn(t as unknown as Sql)
    }) as Promise<T>
  const dir = join(import.meta.dirname, '../migrations')
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort())
    await run((t) => t.unsafe(readFileSync(join(dir, f), 'utf8')))
  return {
    sql,
    schema,
    run,
    env: {
      HYPERDRIVE: { connectionString: '' },
      JWT_SECRET: 'segredo-de-teste-segredo-de-teste',
      DB_SCHEMA: schema,
      ...extra,
    },
    drop: async () => {
      await sql.unsafe(`drop schema "${schema}" cascade`)
      await sql.end()
    },
  }
}

export interface Client {
  request(method: string, path: string, body?: unknown): Promise<{ status: number; body: any; headers: Headers }>
  get(path: string): ReturnType<Client['request']>
  put(path: string, body?: unknown): ReturnType<Client['request']>
  post(path: string, body?: unknown): ReturnType<Client['request']>
  cookies: Map<string, string>
  /** Envia/lê bytes (fotos), com o mesmo jar de cookies. */
  raw(method: string, path: string, body?: Uint8Array, contentType?: string): Promise<{ status: number; bytes: Uint8Array; headers: Headers }>
}

/** Cliente HTTP de teste, com o próprio "jar" de cookies. */
export function makeClient(db: TestDb): Client {
  const app = createApp({ connect: () => db.sql })
  const cookies = new Map<string, string>()
  const request: Client['request'] = async (method, path, body) => {
    const headers = new Headers()
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    if (cookies.size) headers.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, db.env)
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';')
      const i = pair.indexOf('=')
      const [k, v] = [pair.slice(0, i), pair.slice(i + 1)]
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(sc) || v === '') cookies.delete(k)
      else cookies.set(k, v)
    }
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers }
  }
  const raw: Client['raw'] = async (method, path, body, contentType) => {
    const headers = new Headers()
    if (contentType) headers.set('Content-Type', contentType)
    if (cookies.size) headers.set('Cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    const res = await app.request(path, { method, headers, body }, db.env)
    return { status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), headers: res.headers }
  }
  return {
    request,
    raw,
    cookies,
    get: (p) => request('GET', p),
    put: (p, b) => request('PUT', p, b),
    post: (p, b) => request('POST', p, b),
  }
}

export async function loggedIn(db: TestDb, username = 'ana'): Promise<Client> {
  const c = makeClient(db)
  const res = await c.post('/api/auth/register', { username, password: PW })
  if (res.status !== 201) throw new Error(`registro falhou: ${res.status} ${JSON.stringify(res.body)}`)
  return c
}

export const sampleState = () => ({
  v: 1,
  areas: [
    {
      id: 'a1',
      name: 'Quarto',
      emoji: '🛏️',
      routines: [
        {
          id: 'r1',
          name: 'Limpeza geral',
          period: { type: 'interval', every: 7, unit: 'days' },
          lastDone: 1729300000000,
          history: [1729300000000, 1729200000000],
          createdAt: 1729000000000,
          forceDue: 1729300001234,
        },
        {
          id: 'r2',
          name: 'Arrumação rápida',
          period: { type: 'interval', every: 1, unit: 'days' },
          lastDone: null,
          history: [] as number[],
          createdAt: 1729000000000,
        },
      ],
      createdAt: 1729000000000,
      order: 0,
    },
    {
      id: 'a2',
      name: 'Plantas',
      emoji: '🪴',
      routines: [
        {
          id: 'r3',
          name: '',
          period: { type: 'weekly', days: [2, 5], time: '21:00' },
          lastDone: null,
          history: [] as number[],
          createdAt: 1729000000000,
        },
      ],
      createdAt: 1729000000000,
      order: 1,
      acceptsTasks: false,
    },
  ],
  tasks: [
    {
      id: 't1', title: 'Trocar a roupa de cama', quad: 'agendar', areaId: 'a1', notes: 'lençol azul',
      due: '2026-10-25', createdAt: 1729300000000, eventId: 'e1',
    },
    { id: 't2', title: 'Sem classificação', quad: '', areaId: 'a1', notes: '', due: '', createdAt: 1729300000001 },
  ],
  events: [
    {
      id: 'e1', title: 'Yoga', date: '2026-10-20', allDay: false, start: '19:00', end: '20:00',
      repeat: 'weekly', notes: '', origin: '2026-10-20', doneDates: ['2026-10-27', '2026-11-03'],
      createdAt: 1729300000000,
    },
    {
      id: 'e2', title: 'Feriado', date: '2026-11-02', allDay: true, start: '', end: '', repeat: 'yearly',
      notes: 'sem trabalho', origin: '2026-11-02', createdAt: 1729300000000,
    },
  ],
  lists: {
    indicacoes: [{ id: 'i1', title: 'Parasita', kind: 'filme', note: 'Netflix', createdAt: 1729000000002 }],
    hobbies: [{ id: 'h1', title: 'Cerâmica', createdAt: 1729000000001 }],
    compras: [],
  },
  notes: [
    { id: 'n1', title: 'Ideias', body: 'primeira linha\nsegunda linha', createdAt: 1729000000000, updatedAt: 1729100000000 },
  ],
  missed: [
    {
      id: 'e0:2026-10-18', eventId: 'e0', title: 'Dentista', date: '2026-10-18', allDay: false, start: '15:00',
      end: '16:00', repeat: 'none', notes: 'levar exames', taskIds: ['t1'],
    },
  ],
  reprioDate: '2026-10-19',
})
