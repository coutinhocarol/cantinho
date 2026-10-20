import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Sql } from 'postgres'
import { createApp, isDbUnavailable } from '../src/app'
import { PW, createTestDb, loggedIn, makeClient } from './helpers'
import type { TestDb } from './helpers'

let db: TestDb
beforeAll(async () => {
  db = await createTestDb({ MAX_USERS: '2' })
})
afterAll(() => db.drop())
beforeEach(async () => {
  await db.run((t) => t`truncate users cascade`)
})

describe('limite de contas', () => {
  it('recusa novas contas ao atingir o teto, com mensagem clara', async () => {
    await loggedIn(db, 'alice')
    await loggedIn(db, 'bruna')
    const res = await makeClient(db).post('/api/auth/register', { username: 'carla', password: PW })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('users_limit')
    expect(res.body.detail).toMatch(/limite de contas/)
    // quem já tem conta continua entrando
    const again = await makeClient(db).post('/api/auth/login', { username: 'alice', password: PW })
    expect(again.status).toBe(200)
  })
})

describe('banco indisponível', () => {
  const brokenDb = (code: string) =>
    ({
      begin: () => Promise.reject(Object.assign(new Error('falhou'), { code })),
    }) as unknown as Sql

  const call = async (code: string, path: string, init?: RequestInit) => {
    const app = createApp({ connect: () => brokenDb(code) })
    return app.request(path, init, db.env)
  }

  it.each(['CONNECT_TIMEOUT', 'ECONNREFUSED', '53300', '57P03', '08006'])('%s vira 503 com código db_unavailable', async (code) => {
    const res = await call(code, '/api/health/db')
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('30')
    const body = (await res.json()) as any
    expect(body.code).toBe('db_unavailable')
    expect(body.detail).toMatch(/banco de dados está indisponível/)
  })

  it('uma sessão válida não vira "deslogado" quando o banco cai', async () => {
    const ana = await loggedIn(db, 'ana')
    const app = createApp({ connect: () => brokenDb('ECONNREFUSED') })
    const cookie = `cantinho_session=${ana.cookies.get('cantinho_session')}`
    const res = await app.request('/api/state', { headers: { Cookie: cookie } }, db.env)
    expect(res.status).toBe(503) // e não 401
  })

  it('erro inesperado vira 500 genérico, sem vazar detalhes', async () => {
    const res = await call('XX000', '/api/health/db')
    expect(res.status).toBe(500)
    const body = (await res.json()) as any
    expect(body.code).toBe('internal')
    expect(JSON.stringify(body)).not.toContain('falhou')
  })

  it('isDbUnavailable reconhece só falhas de conexão', () => {
    expect(isDbUnavailable({ code: 'CONNECTION_CLOSED' })).toBe(true)
    expect(isDbUnavailable({ code: '23505' })).toBe(false)
    expect(isDbUnavailable(new Error('x'))).toBe(false)
    expect(isDbUnavailable(null)).toBe(false)
  })
})
