import { join } from 'node:path'

// As variáveis (DATABASE_URL) vêm do .env da raiz do projeto.
try {
  process.loadEnvFile(join(import.meta.dirname, '../../.env'))
} catch {
  /* sem .env: usa o ambiente */
}
