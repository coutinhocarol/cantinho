import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, loggedIn, makeClient, sampleState } from './helpers'
import type { Client, TestDb } from './helpers'

let db: TestDb
let client: Client
beforeAll(async () => {
  db = await createTestDb()
})
afterAll(() => db.drop())
beforeEach(async () => {
  await db.run((t) => t`truncate users cascade`)
  client = await loggedIn(db)
})

const count = (table: string) =>
  db.run((t) => t.unsafe(`select count(*)::int as n from ${table}`)).then((r) => r[0].n as number)

describe('saúde', () => {
  it('health e health/db', async () => {
    const c = makeClient(db)
    expect((await c.get('/api/health')).body).toEqual({ status: 'ok' })
    expect((await c.get('/api/health/db')).status).toBe(200)
  })
  it('rota inexistente devolve 404 em JSON', async () => {
    expect((await makeClient(db).get('/api/nada')).status).toBe(404)
  })
})

describe('/api/state', () => {
  it('sem estado salvo responde 204', async () => {
    expect((await client.get('/api/state')).status).toBe(204)
  })

  it('PUT e depois GET devolvem o mesmo estado', async () => {
    const res = await client.put('/api/state', sampleState())
    expect(res.status).toBe(200)
    expect(res.body.updatedAt).toBeTruthy()
    const saved = (await client.get('/api/state')).body

    const [a1, a2] = saved.areas
    expect(a1.period).toEqual({ type: 'interval', every: 7, unit: 'days' })
    expect(a1.history).toEqual([1729300000000, 1729200000000]) // mais recente primeiro
    expect([a1.lastDone, a1.forceDue, a1.emoji]).toEqual([1729300000000, 1729300001234, '🛏️'])
    expect(a2.period).toEqual({ type: 'weekly', days: [2, 5], time: '21:00' })
    expect([a2.lastDone, a2.acceptsTasks]).toEqual([null, false])
    expect(saved.areas.map((a: any) => a.order)).toEqual([0, 1])

    const [t1, t2] = saved.tasks
    expect([t1.quad, t1.due, t1.eventId, t1.notes]).toEqual(['agendar', '2026-10-25', 'e1', 'lençol azul'])
    expect([t2.quad, t2.due, 'eventId' in t2]).toEqual(['', '', false])

    const [e1, e2] = saved.events
    expect([e1.start, e1.end, e1.repeat]).toEqual(['19:00', '20:00', 'weekly'])
    expect(e1.doneDates).toEqual(['2026-10-27', '2026-11-03'])
    expect([e2.allDay, e2.start, e2.end, e2.notes]).toEqual([true, '', '', 'sem trabalho'])

    expect(saved.water).toEqual({ goal: 8, date: '2026-10-19', count: 3, v2: true })
    expect(saved.lists.hobbies[0].title).toBe('Cerâmica')
    expect(saved.missed).toEqual(sampleState().missed)
    expect(saved.reprioDate).toBe('2026-10-19')
    expect(saved.lists.indicacoes[0]).toMatchObject({ id: 'i1', title: 'Parasita', kind: 'filme', note: 'Netflix' })
  })

  it('os dados ficam em tabelas relacionais', async () => {
    await client.put('/api/state', sampleState())
    expect(await count('areas')).toBe(2)
    expect(await count('tasks')).toBe(2)
    expect(await count('events')).toBe(2)
    expect(await count('area_checks')).toBe(2)
    expect(await count('event_done_dates')).toBe(2)
    expect(await count('list_items')).toBe(2)
    const [t] = await db.run((t) => t`select area_id, event_id from tasks where id = 't1'`)
    expect(t).toEqual({ area_id: 'a1', event_id: 'e1' })
  })

  it('linhas antigas da lista de compras voltam a ser lidas e preservadas', async () => {
    await client.put('/api/state', sampleState())
    await db.run(
      (t) => t`insert into list_items (user_id, id, list_name, title) select user_id, 'velho', 'compras', 'Leite' from list_items limit 1`,
    )
    const saved = (await client.get('/api/state')).body
    expect(saved.lists.compras.map((i: any) => i.title)).toEqual(['Leite'])
    expect(saved.lists.hobbies).toHaveLength(1)
    await client.put('/api/state', saved)
    expect(await count('list_items')).toBe(3)
  })

  it('salvar duas vezes dá o mesmo resultado', async () => {
    await client.put('/api/state', sampleState())
    const first = (await client.get('/api/state')).body
    await client.put('/api/state', first)
    expect((await client.get('/api/state')).body).toEqual(first)
  })

  it('remove o que deixou de existir', async () => {
    await client.put('/api/state', sampleState())
    const s = sampleState()
    s.tasks = [s.tasks[1]]
    s.events = [s.events[1]]
    s.lists.hobbies = []
    s.missed = []
    s.areas[0].history = [1729300000000]
    expect((await client.put('/api/state', s)).status).toBe(200)
    const saved = (await client.get('/api/state')).body
    expect(saved.tasks.map((t: any) => t.id)).toEqual(['t2'])
    expect(saved.events.map((e: any) => e.id)).toEqual(['e2'])
    expect(saved.lists.hobbies).toEqual([])
    expect(saved.missed).toEqual([])
    expect(saved.areas[0].history).toEqual([1729300000000])
    expect(await count('event_done_dates')).toBe(0)
  })

  it('apagar a área mantém as tarefas, sem área', async () => {
    await client.put('/api/state', sampleState())
    const s = sampleState()
    s.areas = [s.areas[1]]
    for (const t of s.tasks) (t as any).areaId = null // o app solta as tarefas da área excluída
    expect((await client.put('/api/state', s)).status).toBe(200)
    const saved = (await client.get('/api/state')).body
    expect(saved.tasks.map((t: any) => [t.id, t.areaId])).toEqual([
      ['t1', ''],
      ['t2', ''],
    ])
    expect(await count('area_checks')).toBe(0)
  })

  it('o próprio banco zera a área da tarefa (ON DELETE SET NULL)', async () => {
    await client.put('/api/state', sampleState())
    await db.run((t) => t`delete from areas where id = 'a1'`)
    const rows = await db.run((t) => t`select area_id, user_id from tasks`)
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.area_id === null && r.user_id)).toBe(true)
  })

  it('tarefa sem área faz ida e volta', async () => {
    const s = sampleState()
    s.tasks[1].areaId = ''
    expect((await client.put('/api/state', s)).status).toBe(200)
    const t2 = (await client.get('/api/state')).body.tasks[1]
    expect([t2.areaId, t2.title]).toEqual(['', 'Sem classificação'])
  })

  it('remover um compromisso desliga as tarefas dele', async () => {
    await client.put('/api/state', sampleState())
    const s = sampleState()
    s.events = [s.events[1]]
    await client.put('/api/state', s)
    const t1 = (await client.get('/api/state')).body.tasks.find((t: any) => t.id === 't1')
    expect('eventId' in t1).toBe(false)
  })

  it('reordenar e editar áreas', async () => {
    await client.put('/api/state', sampleState())
    const s = sampleState()
    s.areas.reverse()
    s.areas[1].name = 'Quarto de hóspedes'
    s.areas[1].period = { type: 'interval', every: 3, unit: 'days' } as any
    await client.put('/api/state', s)
    const areas = (await client.get('/api/state')).body.areas
    expect(areas.map((a: any) => a.id)).toEqual(['a2', 'a1'])
    expect([areas[1].name, areas[1].period.every]).toEqual(['Quarto de hóspedes', 3])
  })

  it('períodos antigos são convertidos', async () => {
    const s = sampleState()
    s.areas[0].period = { type: 'interval', every: 2, unit: 'weeks' } as any
    s.areas[1].period = { type: 'monthly' } as any
    await client.put('/api/state', s)
    expect((await client.get('/api/state')).body.areas.map((a: any) => a.period)).toEqual([
      { type: 'interval', every: 14, unit: 'days' },
      { type: 'interval', every: 30, unit: 'days' },
    ])
  })

  it('a meta de água é limitada a 1..30', async () => {
    const s = sampleState()
    s.water.goal = 99
    await client.put('/api/state', s)
    expect((await client.get('/api/state')).body.water.goal).toBe(30)
  })

  it('tarefa de área inexistente é recusada e nada é salvo', async () => {
    await client.put('/api/state', sampleState())
    const bad = sampleState()
    bad.tasks[0].areaId = 'nao-existe'
    expect((await client.put('/api/state', bad)).status).toBe(422)
    expect((await client.get('/api/state')).body.areas).toHaveLength(2)
  })

  it('uma falha no meio desfaz tudo (transação)', async () => {
    await client.put('/api/state', sampleState())
    const bad = sampleState()
    bad.areas[0].name = 'Nome novo'
    bad.events[0].date = '2026-02-31' // data impossível, só detectada ao gravar
    expect((await client.put('/api/state', bad)).status).toBe(422)
    expect((await client.get('/api/state')).body.areas[0].name).toBe('Quarto')
  })

  it('compromisso sem horário de início é recusado', async () => {
    const s = sampleState()
    s.events[0].start = ''
    expect((await client.put('/api/state', s)).status).toBe(422)
  })

  it('corpo inválido é recusado', async () => {
    expect((await client.put('/api/state', { areas: [{ name: 'sem id' }] })).status).toBe(422)
    expect((await client.put('/api/state', [1, 2, 3])).status).toBe(422)
  })

  it('estado vazio pode ser salvo', async () => {
    expect((await client.put('/api/state', {})).status).toBe(200)
    const saved = (await client.get('/api/state')).body
    expect([saved.areas, saved.water.goal]).toEqual([[], 10])
  })

  it('nomes com aspas, emojis e SQL são guardados como texto', async () => {
    const s = sampleState()
    s.areas[0].name = `Robert'); DROP TABLE areas;-- 🍳 "x"`
    await client.put('/api/state', s)
    expect((await client.get('/api/state')).body.areas[0].name).toBe(s.areas[0].name)
    expect(await count('areas')).toBe(2)
  })
})
