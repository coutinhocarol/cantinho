import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AuthError } from '../lib/auth'
import { ServiceError } from '../lib/failure'
import type { AuthApi, User } from '../lib/auth'
import { emptyState } from '../lib/state'
import { LS_KEY } from '../lib/store'
import type { AppState } from '../lib/types'
import Root from './Root'

const ana: User = { id: 'u-ana', username: 'ana' }
const bia: User = { id: 'u-bia', username: 'bia' }

function fakeAuth(initial: User | null = null): AuthApi & { current: User | null } {
  const auth = {
    current: initial,
    me: vi.fn(async () => auth.current),
    login: vi.fn(async (username: string, password: string) => {
      if (password !== 'senha-certa-1') throw new AuthError(401, 'Usuário ou senha incorretos')
      auth.current = { id: 'u-' + username, username }
      return auth.current
    }),
    register: vi.fn(async (username: string) => {
      if (username === 'jaexiste') throw new AuthError(409, 'Esse usuário já está em uso')
      auth.current = { id: 'u-' + username, username }
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
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Bora' })).not.toBeInTheDocument()
  })

  it('com sessão válida abre direto o app', async () => {
    const auth = fakeAuth(ana)
    mockServer(auth)
    render(<Root auth={auth} />)
    expect(await screen.findByRole('tab', { name: 'Bora' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument()
  })

  it('entra com usuário e senha corretos', async () => {
    const auth = fakeAuth()
    mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.type(await screen.findByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-1{Enter}')
    expect(await screen.findByRole('tab', { name: 'Bora' })).toBeInTheDocument()
    expect(auth.login).toHaveBeenCalledWith('ana', 'senha-certa-1')
  })

  it('senha errada mostra o erro e continua na tela de login', async () => {
    const auth = fakeAuth()
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.type(await screen.findByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'errada{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha incorretos')
    expect(screen.queryByRole('tab', { name: 'Bora' })).not.toBeInTheDocument()
  })

  it('campos vazios não chamam o servidor', async () => {
    const auth = fakeAuth()
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await screen.findByLabelText('Usuário')
    await user.click(screen.getAllByRole('button', { name: 'Entrar' }).at(-1)!) // botão de enviar
    expect(screen.getByRole('alert')).toHaveTextContent('Preencha o usuário e a senha.')
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('criar conta exige 8 caracteres e trata usuário repetido', async () => {
    const auth = fakeAuth()
    mockServer(auth)
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }))
    await user.type(screen.getByLabelText('Usuário'), 'jaexiste')
    await user.type(screen.getByLabelText('Senha'), 'curta{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 8 caracteres')
    expect(auth.register).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Senha'), 'compridinha{Enter}')
    expect(await screen.findByText('Esse usuário já está em uso')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Usuário'))
    await user.type(screen.getByLabelText('Usuário'), 'nova@example.com{Enter}')
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
    await waitFor(() => expect(screen.getByLabelText('Usuário')).toBeInTheDocument())
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
    await user.type(await screen.findByLabelText('Usuário'), 'bia')
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
    expect(await screen.findByLabelText('Usuário', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/Não consegui salvar/)).not.toBeInTheDocument()
  })
})

describe('Falhas do servidor', () => {
  const limitAuth = (): AuthApi & { current: User | null } => {
    const auth = fakeAuth()
    auth.login = vi.fn(async () => {
      throw new ServiceError('limit', 429)
    })
    return auth
  }

  it('limite de uso estourado no login mostra uma mensagem clara', async () => {
    const user = userEvent.setup()
    render(<Root auth={limitAuth()} />)
    await user.type(await screen.findByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-1{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/limite de uso do plano gratuito da Cloudflare/)
    expect(screen.getByRole('alert')).toHaveTextContent(/Tente de novo mais tarde/)
  })

  it('servidor fora do ar ao abrir: a tela de login já avisa o motivo', async () => {
    const auth = fakeAuth()
    auth.me = vi.fn(async () => {
      throw new ServiceError('db', 503)
    })
    render(<Root auth={auth} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/banco de dados está indisponível/)
  })

  it('limite de contas no cadastro', async () => {
    const auth = fakeAuth()
    auth.register = vi.fn(async () => {
      throw new ServiceError('users_limit', 403)
    })
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('button', { name: 'Criar conta' }))
    await user.type(screen.getByLabelText('Usuário'), 'nova')
    await user.type(screen.getByLabelText('Senha'), 'senha-comprida{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/limite de contas/)
  })

  it('a tela de login explica como começar (sem conta prévia)', async () => {
    render(<Root auth={fakeAuth()} />)
    expect(await screen.findByText(/Primeira vez por aqui\?/)).toBeInTheDocument()
  })

  it('quando a cota acaba durante o uso, aparece um aviso fixo e o app segue funcionando', async () => {
    const auth = fakeAuth(ana)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'PUT'
          ? new Response('<html>1102</html>', { status: 503, headers: { 'Content-Type': 'text/html' } })
          : new Response(null, { status: 204 }),
      ),
    )
    const user = userEvent.setup()
    render(<Root auth={auth} />)
    await user.click(await screen.findByRole('tab', { name: 'Áreas' }))
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    await user.type(screen.getByPlaceholderText('Ex.: Quarto'), 'Quarto{Enter}')
    // o aviso aparece no balão (5 s) e fica fixo no topo enquanto o problema durar
    await screen.findAllByText(/limite de uso do plano gratuito da Cloudflare/, {}, { timeout: 4000 })
    const note = document.querySelector('.past-note') as HTMLElement
    expect(note).toHaveTextContent(/limite de uso do plano gratuito da Cloudflare/)
    expect(note).toHaveTextContent(/Seus dados ficam só neste aparelho/)
    expect(screen.getByText('Quarto')).toBeInTheDocument() // continua usável
  })
})
