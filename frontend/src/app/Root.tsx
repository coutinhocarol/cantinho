import { useCallback, useEffect, useMemo, useState } from 'react'
import { createHttpApi } from '../lib/api'
import type { AuthApi, User } from '../lib/auth'
import { Store } from '../lib/store'
import App from './App'
import { LoginScreen } from './LoginScreen'

type Session = { status: 'loading' } | { status: 'out' } | { status: 'in'; user: User }

/** Decide entre a tela de login e o app, e cria o store de quem está logado. */
export default function Root({ auth }: { auth: AuthApi }) {
  const [session, setSession] = useState<Session>({ status: 'loading' })

  useEffect(() => {
    let alive = true
    auth
      .me()
      .then((user) => alive && setSession(user ? { status: 'in', user } : { status: 'out' }))
      .catch(() => alive && setSession({ status: 'out' }))
    return () => {
      alive = false
    }
  }, [auth])

  const expired = useCallback(() => setSession({ status: 'out' }), [])

  if (session.status === 'loading') return null
  if (session.status === 'out')
    return <LoginScreen auth={auth} onDone={(user) => setSession({ status: 'in', user })} />
  return <LoggedIn key={session.user.id} user={session.user} auth={auth} onExit={expired} />
}

function LoggedIn({ user, auth, onExit }: { user: User; auth: AuthApi; onExit: () => void }) {
  const store = useMemo(
    () => new Store({ api: createHttpApi('/api', onExit), namespace: user.id }),
    [user.id, onExit],
  )
  const logout = async () => {
    await store.flush().catch(() => {}) // não perde o que ainda estava para ser salvo
    await auth.logout().catch(() => {})
    store.clearLocal()
    onExit()
  }
  return <App store={store} userEmail={user.email} onLogout={logout} />
}
