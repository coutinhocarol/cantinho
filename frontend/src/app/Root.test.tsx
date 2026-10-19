import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '../lib/auth'
import type { AuthApi, User } from '../lib/auth'
import { emptyState } from '../lib/state'
import { LS_KEY } from '../lib/store'
import type { AppState } from '../lib/types'
import Root from './Root'

const ana: User = { id: 'u-ana', email: 'ana@example.com' }
const bia: User = { id: 'u-bia', email: 'bia@example.com' }

function fakeAuth(initial: User | null = null): AuthApi & { current: User | null } {
  const auth = {
    current: initial,
    me: vi.fn(async () => auth.current),
    login: vi.fn(async (email: string, password: string) => {
      if (password !== 'senha-certa-1') throw new AuthError(401, 'E-mail ou senha incorretos')
      auth.current = { id: 'u-' + email.split('@')[0], email }
      return auth.current
    }),
    register: vi.fn(async (email: string) => {
      if (email === 'ja@existe.com') throw new AuthError(409, 'Já existe uma conta com esse e-mail')
      auth.current = { id: 'u-' + email.split('@')[0], email }
      return auth.current
    }),
    logout: vi.fn(async () => {
      auth.current = null
    }),
  }
  return auth
}

/** Servidor falso: guarda um estado por usuário logado. */
function mockServer(auth: { current: User | null }, saved: Record<string, AppState> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = auth.current
      if (!u) return new Response('{}', { status: 401 })
      if (init?.method === 'PUT') {
        saved[u.id] = JSON.parse(init.body as string)
        return new Response('{"updatedAt":"x"}', { status: 200 })
      }
      if (url.endsWith('/state')) {
        return saved[u.id]
          ? new Response(JSON.stringify(saved[u.id]), { status: 200 })
          : new Response(null, { status: 204 })
      }
      return new Response('{}', { status: 404 })
    }),
  )
  return saved
}

const stateWithArea = (name: string): AppState => {
  const s = emptyState()
  s.water = { goal: 10, date: new Date().toISOString().slice(0, 10), count: 0, v2: true }
  s.areas.push({
    id: 'a-' + name,
    name,
    emoji: '🏠',
    period: { type: 'interval', every: 7, unit: 'days' },
    lastDone: null,
    history: [],
    createdAt: Date.now(),
    order: 0,
  })
  return s
}

describe('Login', () => {
  it('sem sessão mostra a tela de login (e não o app)', async () => {
    render(<Root auth={fakeAuth()} />)
    expect(await screen.findByRole('heading', { name: 'Cantinho' })).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Bora' })).not.toBeInTheDocument()
  })

  it('com sessão válida abre direto o app', async () => {
    const auth = fakeAuth(ana)
    mockServer(auth)
    render(<Root auth={auth} />)
    expect(await screen.findByRole('tab', { name: 'Bora' })).toBeInTheDocument()
    expect(screen.queryByLabelText('E-mail')).not.toBeInTheDocument()
  })

  it('entra com e-mail e senha corretos', async () => {
    const auth = fakeAuth()
    mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-1{Enter}')
    expect(await screen.findByRole('tab', { name: 'Bora' })).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('ana@example.com', 'senha-certa-1')
  })

  it('senha errada mostra o erro e continua na tela de login', async () => {
    const auth = fakeAuth()
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com')
    await user.type(screen.getByLabelText('Senha'), 'errada{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos')
    expect(screen.queryByRole('tab', { name: 'Bora' })).not.toBeInTheDocument()
  })

  it('campos vazios não chamam o servidor', async () => {
    const auth = fakeAuth()
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await screen.findByLabelText('E-mail')
    await user.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1)!) // botão de enviar
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha o e-mail e a senha.')
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('criar conta exige 8 caracteres e trata e-mail repetido', async () => {
    const auth = fakeAuth()
    mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }))
    await user.type(screen.getByLabelText('E-mail'), 'ja@existe.com')
    await user.type(screen.getByLabelText('Senha'), 'curta{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 8 caracteres')
    expect(auth.register).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Senha'), 'compridinha{Enter}')
    expect(await screen.findByText('Já existe uma conta com esse e-mail')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('E-mail'))
    await user.type(screen.getByLabelText('E-mail'), 'nova@example.com{Enter}')
    expect(await screen.findByRole('tab', { name: 'Bora' })).toBeInTheDocument()
  })

  it('sair salva o que faltava, encerra a sessão e apaga a cópia local', async () => {
    const auth = fakeAuth(ana)
    const saved = mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('tab', { name: 'Áreas' }))
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    await user.type(screen.getByPlaceholderText('Ex.: Quarto'), 'Quarto{Enter}')
    expect(localStorage.getItem(`${LS_KEY}:${ana.id}`)).toContain('Quarto')
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toBeInTheDocument())
    expect(auth.logout).toHaveBeenCalled()
    expect(saved[ana.id].areas[0].name).toBe('Quarto')
    expect(localStorage.getItem(`${LS_KEY}:${ana.id}`)).toBeNull()
  })

  it('cada conta enxerga só os próprios dados, mesmo no mesmo navegador', async () => {
    const auth = fakeAuth(ana)
    mockServer(auth, { [ana.id]: stateWithArea('Quarto da Ana'), [bia.id]: stateWithArea('Quarto da Bia') })
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('tab', { name: 'Áreas' }))
    expect(await screen.findByText('Quarto da Ana')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Sair' }))
    await user.type(await screen.findByLabelText('E-mail'), 'bia@example.com')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-1{Enter}')
    await user.click(await screen.findByRole('tab', { name: 'Áreas' }))
    expect(await screen.findByText('Quarto da Bia')).toBeInTheDocument()
    expect(screen.queryByText('Quarto da Ana')).not.toBeInTheDocument()
  })

  it('se a sessão expirar durante o uso, volta para o login sem alarde', async () => {
    const auth = fakeAuth(ana)
    mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await screen.findByRole('tab', { name: 'Bora' })
    auth.current = null // o servidor passa a responder 401
    await user.click(screen.getByRole('tab', { name: 'Áreas' }))
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    await user.type(screen.getByPlaceholderText('Ex.: Quarto'), 'Quarto{Enter}')
    expect(await screen.findByLabelText('E-mail', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/Não consegui salvar/)).not.toBeInTheDocument()
  })
})
