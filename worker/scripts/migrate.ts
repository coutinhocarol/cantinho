// Aplica os arquivos de migrations/*.sql que ainda não rodaram (controle na tabela schema_migrations).
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const raw = process.env.DATABASE_URL
if (!raw) throw new Error('DATABASE_URL não definida (veja o .env na raiz do projeto)')
// o .env usa o formato do SQLAlchemy ("postgresql+psycopg://"); o driver daqui quer "postgresql://"
const sql = postgres(raw.replace(/^postgresql\+\w+:/, 'postgresql:'), { max: 1, onnotice: () => {} })

const dir = join(import.meta.dirname, '..', 'migrations')
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`
  await sql`alter table schema_migrations enable row level security`
  const applied = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name))

  // bancos criados antes por outra ferramenta já têm as tabelas da primeira migração
  const [{ has_users }] = await sql<{ has_users: boolean }[]>`select to_regclass('public.users') is not null as has_users`
  if (has_users && !applied.has(files[0])) {
    await sql`insert into schema_migrations (name) values (${files[0]})`
    applied.add(files[0])
    console.log(`= ${files[0]} (tabelas já existiam)`)
  }

  for (const f of files) {
    if (applied.has(f)) continue
    await sql.begin(async (tx) => {
      await tx.unsafe(readFileSync(join(dir, f), 'utf8'))
      await tx`insert into schema_migrations (name) values (${f})`
    })
    console.log(`+ ${f}`)
  }
  console.log('Banco em dia.')
} finally {
  await sql.end()
}
