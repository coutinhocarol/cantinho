import { Hono } from 'hono'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Sql } from 'postgres'
import type { ZodType } from 'zod'
import { loadState, replaceState, StateError } from './repository'
import { AppStateSchema, Credentials, Registration } from './schemas'
import { COOKIE_NAME, createToken, hashPassword, readToken, verifyPassword } from './security'

export interface Env {
  /** Pool de conexões da Cloudflare para o Postgres do Supabase. */
  HYPERDRIVE: { connectionString: string }
  /** Chave que assina a sessão (cookie). Trocar a chave desloga todo mundo. */
  JWT_SECRET: string
  SESSION_DAYS?: string
  /** "true" em produção (HTTPS); em http://localhost o cookie Secure não funciona. */
  COOKIE_SECURE?: string
  /** "false" fecha a criação de contas novas. */
  ALLOW_REGISTRATION?: string
  /** Teto de contas (protege o armazenamento gratuito do banco). Padrão: 1000. */
  MAX_USERS?: string
  /** Só para testes: roda tudo num schema temporário em vez do `public`. */
  DB_SCHEMA?: string
}

interface Deps {
  /** Abre a conexão com o banco para esta requisição. */
  connect(env: Env): Sql
  /** Fecha a conexão ao fim da requisição (omitir quando a conexão é compartilhada). */
  release?(sql: Sql, c: Context): void
}

type Vars = { sql: Sql; user: { id: string; username: string } }
type Ctx = Context<{ Bindings: Env; Variables: Vars }>

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/

/** Erros de conexão com o Postgres (banco pausado/fora do ar, limite de conexões, rede). */
export function isDbUnavailable(e: unknown): boolean {
  const code = String((e as { code?: unknown })?.code ?? '')
  return (
    /^(CONNECT_TIMEOUT|CONNECTION_|ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN)/.test(code) ||
    /^(08|53|57P0|28)/.test(code) // conexão, falta de recursos/conexões, desligamento, autenticação
  )
}

export function createApp(deps: Deps) {
  const app = new Hono<{ Bindings: Env; Variables: Vars }>()

  app.use('/api/*', async (c, next) => {
    const sql = deps.connect(c.env)
    c.set('sql', sql)
    try {
      await next()
    } finally {
      deps.release?.(sql, c)
    }
  })

  /** Executa `fn` numa transação (no schema de testes, se houver). */
  const tx = <T>(c: Ctx, fn: (t: Sql) => Promise<T>): Promise<T> =>
    c.var.sql.begin(async (t) => {
      const schema = c.env.DB_SCHEMA
      if (schema) {
        if (!SCHEMA_RE.test(schema)) throw new Error('DB_SCHEMA inválido')
        await t.unsafe(`set local search_path to "${schema}"`)
      }
      return fn(t as unknown as Sql)
    }) as Promise<T>

  const json = (c: Ctx, status: number, detail: string, code?: string) =>
    c.json({ detail, ...(code ? { code } : {}) }, status as 400)

  async function parseBody<T>(c: Ctx, schema: ZodType<T>): Promise<{ ok: true; data: T } | { ok: false }> {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      body = undefined
    }
    const r = schema.safeParse(body)
    return r.success ? { ok: true, data: r.data } : { ok: false }
  }

  const startSession = async (c: Ctx, user: { id: string; username: string }) => {
    const days = Number(c.env.SESSION_DAYS ?? 30)
    setCookie(c, COOKIE_NAME, await createToken(user.id, c.env.JWT_SECRET, days), {
      httpOnly: true,
      sameSite: 'Lax',
      secure: c.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: days * 86400,
    })
    return { id: user.id, username: user.username }
  }

  const requireUser = async (c: Ctx, next: () => Promise<void>) => {
    const token = getCookie(c, COOKIE_NAME)
    const id = token ? await readToken(token, c.env.JWT_SECRET) : null
    // se o banco falhar aqui o erro sobe (503), em vez de parecer "sessão expirada"
    const rows = id
      ? await tx(c, (t) => t<{ id: string; username: string }[]>`select id, username from users where id::text = ${id}`)
      : []
    if (!rows[0]) return json(c, 401, 'Não autenticado')
    c.set('user', rows[0])
    await next()
  }

  // ---------- saúde ----------
  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.get('/api/health/db', async (c) => {
    await tx(c, (t) => t`select 1`)
    return c.json({ status: 'ok' })
  })

  // ---------- login ----------
  app.post('/api/auth/register', async (c) => {
    if (c.env.ALLOW_REGISTRATION === 'false') return json(c, 403, 'Criação de contas desativada')
    const body = await parseBody(c, Registration)
    if (!body.ok) return json(c, 422, 'Dados inválidos')
    const max = Number(c.env.MAX_USERS ?? 1000)
    const [{ n }] = await tx(c, (t) => t<{ n: number }[]>`select count(*)::int as n from users`)
    if (n >= max)
      return json(c, 403, 'O limite de contas deste site foi atingido. Tente novamente mais tarde.', 'users_limit')
    const username = body.data.username.toLowerCase()
    const hash = await hashPassword(body.data.password)
    try {
      const [user] = await tx(
        c,
        (t) => t<{ id: string; username: string }[]>`
          insert into users (id, username, password_hash) values (gen_random_uuid(), ${username}, ${hash})
          returning id, username`,
      )
      return c.json(await startSession(c, user), 201)
    } catch (e) {
      if ((e as { code?: string }).code === '23505') return json(c, 409, 'Esse usuário já está em uso')
      throw e
    }
  })

  app.post('/api/auth/login', async (c) => {
    const body = await parseBody(c, Credentials)
    if (!body.ok) return json(c, 422, 'Dados inválidos')
    const [user] = await tx(
      c,
      (t) => t<{ id: string; username: string; password_hash: string }[]>`
        select id, username, password_hash from users where username = ${body.data.username.toLowerCase()}`,
    )
    // com usuário inexistente a verificação roda do mesmo jeito (mesmo tempo de resposta)
    if (!(await verifyPassword(user?.password_hash ?? null, body.data.password)) || !user)
      return json(c, 401, 'Usuário ou senha incorretos')
    return c.json(await startSession(c, user))
  })

  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, COOKIE_NAME, { path: '/' })
    return c.body(null, 204)
  })

  app.get('/api/auth/me', requireUser, (c) => c.json(c.var.user))

  // ---------- dados do app ----------
  app.get('/api/state', requireUser, async (c) => {
    const data = await tx(c, (t) => loadState(t, c.var.user.id))
    return data ? c.json(data) : c.body(null, 204)
  })

  app.put('/api/state', requireUser, async (c) => {
    const body = await parseBody(c, AppStateSchema)
    if (!body.ok) return json(c, 422, 'Estado inválido')
    try {
      await tx(c, (t) => replaceState(t, c.var.user.id, body.data))
    } catch (e) {
      if (e instanceof StateError) return json(c, 422, e.message)
      throw e
    }
    return c.json({ updatedAt: new Date().toISOString() })
  })

  app.notFound((c) => c.json({ detail: 'Não encontrado' }, 404))
  app.onError((e, c) => {
    console.error(e)
    if (isDbUnavailable(e))
      return c.json(
        {
          code: 'db_unavailable',
          detail:
            'O banco de dados está indisponível no momento. No plano gratuito do Supabase ele pode estar pausado por inatividade ou no limite de conexões. Tente de novo em instantes.',
        },
        503,
        { 'Retry-After': '30' },
      )
    return c.json({ code: 'internal', detail: 'Erro interno no servidor. Tente de novo em instantes.' }, 500)
  })
  return app
}
