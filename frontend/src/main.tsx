import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './app/Root'
import { createHttpAuth } from './lib/auth'
import './styles/index.css'
import { applyAppearance } from './lib/appearance'

applyAppearance()

// Limpeza única (2026-11-18): descarta a cópia antiga dos dados guardada neste aparelho, para que
// ela não seja reenviada à conta depois de o banco ter sido zerado. Roda uma vez por aparelho.
try {
  if (localStorage.getItem('cantinho-reset') !== '2026-11-18') {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('cantinho-em-ordem-v1') || k.startsWith('cantinho-synced-v1')) localStorage.removeItem(k)
    }
    localStorage.setItem('cantinho-reset', '2026-11-18')
  }
} catch {
  /* sem armazenamento local */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root auth={createHttpAuth('/api')} />
  </StrictMode>,
)
