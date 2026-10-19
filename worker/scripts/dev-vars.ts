// Gera worker/.dev.vars (usado só pelo `wrangler dev`) a partir do .env da raiz do projeto.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const { DATABASE_URL, JWT_SECRET } = process.env
if (!DATABASE_URL || !JWT_SECRET) throw new Error('Defina DATABASE_URL e JWT_SECRET no .env da raiz')
const url = DATABASE_URL.replace(/^postgresql\+\w+:/, 'postgresql:')
writeFileSync(
  join(import.meta.dirname, '..', '.dev.vars'),
  [
    `JWT_SECRET=${JWT_SECRET}`,
    'COOKIE_SECURE=false',
    `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=${url}`,
    '',
  ].join('\n'),
)
console.log('worker/.dev.vars criado')
