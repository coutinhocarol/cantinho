import { describe, expect, it } from 'vitest'
import { MESSAGES, ServiceError, failureFromResponse, networkFailure } from './failure'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const html = (status: number) =>
  new Response('<html>Error 1102</html>', { status, headers: { 'Content-Type': 'text/html' } })

describe('failureFromResponse', () => {
  it('429 é limite de uso da Cloudflare', async () => {
    const e = (await failureFromResponse(new Response('', { status: 429 })))!
    expect(e.kind).toBe('limit')
    expect(e.message).toMatch(/limite de uso do plano gratuito da Cloudflare/)
    expect(e.message).toMatch(/21h/)
  })

  it('página HTML de erro 5xx (1102/1027) também é limite de uso', async () => {
    expect((await failureFromResponse(html(503)))!.kind).toBe('limit')
    expect((await failureFromResponse(html(500)))!.kind).toBe('limit')
  })

  it('banco indisponível vem com código próprio', async () => {
    const e = (await failureFromResponse(json(503, { code: 'db_unavailable', detail: 'x' })))!
    expect(e.kind).toBe('db')
    expect(e.message).toMatch(/Supabase/)
  })

  it('limite de contas', async () => {
    const e = (await failureFromResponse(json(403, { code: 'users_limit' })))!
    expect(e.kind).toBe('users_limit')
  })

  it('erro 5xx em JSON é erro genérico do servidor', async () => {
    expect((await failureFromResponse(json(500, { code: 'internal' })))!.kind).toBe('server')
  })

  it('erros normais (4xx) não são tratados aqui', async () => {
    expect(await failureFromResponse(json(401, { detail: 'x' }))).toBeNull()
    expect(await failureFromResponse(json(422, { detail: 'x' }))).toBeNull()
    expect(await failureFromResponse(json(409, { detail: 'x' }))).toBeNull()
  })

  it('rede fora do ar', () => {
    const e = networkFailure()
    expect(e).toBeInstanceOf(ServiceError)
    expect(e.message).toBe(MESSAGES.network)
  })
})
