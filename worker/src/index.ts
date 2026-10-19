import postgres from 'postgres'
import { createApp } from './app'

const app = createApp({
  // Uma conexão pequena por requisição; o Hyperdrive faz o pool de verdade com o Supabase.
  connect: (env) => postgres(env.HYPERDRIVE.connectionString, { max: 5, fetch_types: false }),
  release: (sql, c) => c.executionCtx.waitUntil(sql.end({ timeout: 5 })),
})

export default app
