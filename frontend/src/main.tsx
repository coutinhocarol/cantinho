import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './app/Root'
import { createHttpAuth } from './lib/auth'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root auth={createHttpAuth('/api')} />
  </StrictMode>,
)
