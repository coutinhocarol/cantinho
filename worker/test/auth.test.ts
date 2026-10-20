import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../src/security'
import { PW, createTestDb, loggedIn, makeClient, sampleState } from './helpers'
import type { TestDb } from './helpers'

let db: TestDb
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(() => db.drop())
beforeEach(async () => {
  await db.run((t) => t`truncate users cascade`)
})

describe('proteção', () => {
  it('o estado exige login', async () => {
    const c = makeClient(db)
    expect((await c.get('/api/state')).status).toBe(401)
    expect((await c.put('/api/state', {})).status).toBe(401)
    expect((await c.get('/api/auth/me')).status).toBe(401)
  })
})

describe('cadastro e login', () => {
  it('cadastrar já entra; usuário vira minúsculo; cookie é httpOnly', async () => {
    const c = makeClient(db)
    const res = await c.post('/api/auth/register', { username: 'Ana', password: PW })
    expect(res.status).toBe(201)
    expect(res.body.username).toBe('ana')
    const cookie = res.headers.get('set-cookie')!.toLowerCase()
    expect(cookie).toContain('httponly')
    expect(cookie).toContain('samesite=lax')
    expect((await c.get('/api/auth/me')).body.username).toBe('ana')
  })

  it('a senha é guardada com hash', async () => {
    await loggedIn(db)
    const [u] = await db.run((t) => t`select password_hash from users`)
    expect(u.password_hash).not.toContain(PW)
    expect(u.password_hash.startsWith('pbkdf2$sha256$')).toBe(true)
  })

  it('valida usuário, tamanho da senha e duplicidade', async () => {
    const c = makeClient(db)
    const post = (username: string, password: string) => c.post('/api/auth/register', { username, password })
    expect((await post('a b!', PW)).status).toBe(422)
    expect((await post('alice', 'curta')).status).toBe(422)
    expect((await post('alice', PW)).status).toBe(201)
    expect((await post('ALICE', PW)).status).toBe(409)
  })

  it('o cadastro pode ser desativado', async () => {
    const closed = await createTestDb({ ALLOW_REGISTRATION: 'false' })
    try {
      const res = await makeClient(closed).post('/api/auth/register', { username: 'alice', password: PW })
      expect(res.status).toBe(403)
    } finally {
      await closed.drop()
    }
  })

  it('sair, errar a senha e entrar de novo', async () => {
    const c = await loggedIn(db)
    await c.post('/api/auth/logout')
    expect((await c.get('/api/auth/me')).status).toBe(401)
    const bad = await c.post('/api/auth/login', { username: 'ana', password: 'errada-errada' })
    const unknown = await c.post('/api/auth/login', { username: 'ninguem', password: PW })
    expect([bad.status, unknown.status]).toEqual([401, 401])
    expect(unknown.body).toEqual(bad.body) // não revela se o usuário existe
    expect((await c.post('/api/auth/login', { username: 'ANA', password: PW })).status).toBe(200)
    expect((await c.get('/api/auth/me')).status).toBe(200)
  })

  it('token adulterado ou de usuário apagado é recusado', async () => {
    const c = makeClient(db)
    c.cookies.set('cantinho_session', 'lixo.lixo.lixo')
    expect((await c.get('/api/auth/me')).status).toBe(401)

    const ana = await loggedIn(db)
    await db.run((t) => t`delete from users`)
    expect((await ana.get('/api/state')).status).toBe(401)
  })

  it('token assinado com outra chave é recusado', async () => {
    const other = await createTestDb({ JWT_SECRET: 'outra-chave-outra-chave-outra-chave' })
    try {
      const intruder = await loggedIn(other, 'ana')
      const c = makeClient(db)
      c.cookies.set('cantinho_session', intruder.cookies.get('cantinho_session')!)
      expect((await c.get('/api/auth/me')).status).toBe(401)
    } finally {
      await other.drop()
    }
  })
})

describe('isolamento entre usuários', () => {
  it('cada conta só vê os próprios dados, mesmo com ids iguais', async () => {
    const ana = await loggedIn(db, 'ana')
    const bia = await loggedIn(db, 'bia')
    await ana.put('/api/state', sampleState())
    expect((await bia.get('/api/state')).status).toBe(204)

    const other = sampleState()
    other.areas = [{ ...other.areas[0], name: 'Área da Bia' }]
    other.tasks = []
    other.events = []
    other.lists = { indicacoes: [], hobbies: [] }
    other.missed = []
    expect((await bia.put('/api/state', other)).status).toBe(200)

    expect((await bia.get('/api/state')).body.areas.map((a: any) => a.name)).toEqual(['Área da Bia'])
    const anaState = (await ana.get('/api/state')).body
    expect(anaState.areas.map((a: any) => a.name)).toEqual(['Quarto', 'Plantas'])
    expect(anaState.tasks).toHaveLength(2)
  })

  it('apagar o usuário apaga os dados dele', async () => {
    const ana = await loggedIn(db)
    await ana.put('/api/state', sampleState())
    await db.run((t) => t`delete from users`)
    for (const table of ['areas', 'tasks', 'events', 'list_items', 'water', 'area_checks', 'event_done_dates']) {
      const [{ n }] = await db.run((t) => t.unsafe(`select count(*)::int as n from ${table}`))
      expect(n).toBe(0)
    }
  })
})

describe('senhas', () => {
  it('hash e verificação', async () => {
    const h = await hashPassword('abc12345', 1000)
    expect(await verifyPassword(h, 'abc12345')).toBe(true)
    expect(await verifyPassword(h, 'abc12346')).toBe(false)
    expect(await verifyPassword(null, 'abc12345')).toBe(false)
    expect(await verifyPassword('formato-invalido', 'abc12345')).toBe(false)
  })
  it('dois hashes da mesma senha são diferentes (sal)', async () => {
    expect(await hashPassword('abc12345', 1000)).not.toBe(await hashPassword('abc12345', 1000))
  })
})
