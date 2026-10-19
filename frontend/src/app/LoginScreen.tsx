import { useState } from 'react'
import { Flower } from '../components/icons'
import type { AuthApi, User } from '../lib/auth'
import { AuthError } from '../lib/auth'
import { ServiceError } from '../lib/failure'

type Mode = 'login' | 'register'

export function LoginScreen({
  auth,
  onDone,
  notice = '',
}: {
  auth: AuthApi
  onDone: (u: User) => void
  /** Aviso ao abrir a tela (ex.: servidor fora do ar ou limite de uso atingido). */
  notice?: string
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(notice)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setErr('Preencha o e-mail e a senha.')
      return
    }
    if (mode === 'register' && password.length < 8) {
      setErr('Use uma senha de pelo menos 8 caracteres.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const user =
        mode === 'login'
          ? await auth.login(email.trim(), password)
          : await auth.register(email.trim(), password)
      onDone(user)
    } catch (e) {
      setErr(
        e instanceof AuthError || e instanceof ServiceError
          ? e.message
          : 'Não consegui falar com o servidor. Tente de novo.',
      )
      setBusy(false)
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setErr('')
  }

  return (
    <main className="tw:max-w-[440px]">
      <form className="empty tw:mt-[32px]" onSubmit={submit} noValidate>
        <Flower />
        <h1>Cantinho</h1>
        <p className="sub tw:mx-auto tw:mb-[20px]">
          {mode === 'login' ? 'Entre para ver as suas rotinas.' : 'Crie a sua conta para começar.'}
        </p>
        {mode === 'login' ? (
          <p className="preview tw:mb-[16px] tw:text-left">
            Primeira vez por aqui? Escolha “Criar conta” (vale qualquer e-mail).
          </p>
        ) : (
          <p className="preview tw:mb-[16px] tw:text-left">
            Depois de entrar, toque em “Usar exemplos” para ver o app preenchido.
          </p>
        )}
        <div className="seg tw:mb-[16px]">
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
            Entrar
          </button>
          <button
            type="button"
            aria-pressed={mode === 'register'}
            onClick={() => switchMode('register')}
          >
            Criar conta
          </button>
        </div>
        <div className="tw:text-left">
          <label className="lbl" htmlFor="auth-email">
            E-mail
          </label>
          <input
            className="field"
            id="auth-email"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="tw:mt-[12px] tw:text-left">
          <label className="lbl" htmlFor="auth-password">
            Senha
          </label>
          <input
            className="field"
            id="auth-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'register' ? (
            <p className="sub tw:mt-[6px] tw:text-[13px]">Pelo menos 8 caracteres.</p>
          ) : null}
        </div>
        <p className="err tw:mt-[12px] tw:text-left" role="alert">
          {err}
        </p>
        <button type="submit" className="btn primary tw:w-full tw:justify-center" disabled={busy}>
          {mode === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </main>
  )
}
