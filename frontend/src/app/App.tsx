import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { TAB_ICONS } from '../components/icons'
import { createActions } from '../lib/actions'
import type { Store } from '../lib/store'
import { ymd } from '../lib/time'
import { Areas } from '../views/Areas'
import { Calendario } from '../views/Calendario'
import { Inicio } from '../views/Inicio'
import { Listas } from '../views/Listas'
import { Quadro } from '../views/Quadro'
import { AppContext } from './context'
import type { AppCtx, DialogState, TabId, UiState } from './context'
import { DialogHost } from './DialogHost'

const TABS: { id: TabId; label: string }[] = [
  { id: 'inicio', label: 'Bora' },
  { id: 'quadro', label: 'Tarefas' },
  { id: 'calendario', label: 'Calendário' },
  { id: 'listas', label: 'Coisinhas' },
  { id: 'areas', label: 'Áreas' },
]

const ls = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}

function initialUi(): UiState {
  const t = new Date()
  return {
    tview: ls('cantinho-tview') === 'matriz' ? 'matriz' : 'area',
    calView: ls('cantinho-calview') === 'semana' ? 'semana' : 'mes',
    calSel: ymd(t),
    calMonth: { y: t.getFullYear(), m: t.getMonth() },
    listTab: 'indicacoes',
  }
}

interface ToastState {
  msg: string
  undo?: () => void
  show: boolean
}

interface InfoState {
  text: string
  left: number
  top: number
  width: number
  btn: HTMLElement
  at: number
}

export default function App({
  store,
  userEmail,
  onLogout,
}: {
  store: Store
  userEmail?: string
  onLogout?: () => void
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState)
  const syncError = useSyncExternalStore(store.subscribe, store.getSyncError)
  const [tab, setTabState] = useState<TabId>('inicio')
  const [ui, setUiState] = useState<UiState>(initialUi)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [toastState, setToastState] = useState<ToastState>({ msg: '', show: false })
  const [info, setInfo] = useState<InfoState | null>(null)
  const dragging = useRef(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dialogRef = useRef<DialogState>(null)
  dialogRef.current = dialog

  const toast = useCallback((msg: string, undo?: () => void) => {
    setToastState({ msg, undo, show: true })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastState((t) => ({ ...t, show: false })), 5000)
  }, [])

  const actions = useMemo(() => createActions(store, toast), [store, toast])

  const setUi = useCallback((patch: Partial<UiState>) => setUiState((u) => ({ ...u, ...patch })), [])
  const setTab = useCallback((t: TabId) => {
    setTabState(t)
    window.scrollTo(0, 0)
  }, [])
  const openDialog = useCallback((d: Exclude<DialogState, null>) => setDialog(d), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const showInfo = useCallback((btn: HTMLElement, text: string) => {
    setInfo((cur) => {
      if (cur && cur.btn === btn) return null
      const r = btn.getBoundingClientRect()
      const w = Math.min(280, window.innerWidth - 24)
      return {
        text,
        btn,
        at: Date.now(),
        width: w,
        left: Math.max(12, Math.min(r.right - w + 8, window.innerWidth - w - 12)),
        top: r.bottom + 8,
      }
    })
  }, [])

  // sincronização com a conta e avisos
  useEffect(() => {
    store.onSyncFail = toast
    void store.connect()
  }, [store, toast])

  // atualiza contagens de tempo sem gravar nada (a menos que a data tenha virado)
  useEffect(() => {
    const idle = () => !dialogRef.current && !dragging.current
    const id = setInterval(() => {
      if (!idle()) return
      store.refresh()
      void store.pull()
    }, 30000)
    const onVis = () => {
      if (document.hidden || !idle()) return
      store.refresh()
      void store.pull()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [store])

  // balão de ajuda (i): fecha ao clicar fora, com Esc ou ao rolar
  useEffect(() => {
    if (!info) return
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.info-btn')) setInfo(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setInfo(null)
    }
    const onScroll = () => {
      if (Date.now() - info.at > 500) setInfo(null)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll)
    }
  }, [info])

  const ctx: AppCtx = {
    store,
    state,
    commit: store.commit,
    actions,
    toast,
    ui,
    setUi,
    tab,
    setTab,
    dialog,
    openDialog,
    closeDialog,
    showInfo,
    dragging,
  }

  const views: Record<TabId, React.ReactNode> = {
    inicio: <Inicio />,
    quadro: <Quadro />,
    calendario: <Calendario />,
    listas: <Listas />,
    areas: <Areas />,
  }

  return (
    <AppContext.Provider value={ctx}>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <use href="#flower" />
              </svg>
            </span>
            Cantinho
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="tab"
                role="tab"
                data-tab={t.id}
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {TAB_ICONS[t.id]}
                {t.label}
              </button>
            ))}
          </nav>
          {onLogout ? (
            <button type="button" className="btn ghost" title={userEmail} onClick={onLogout}>
              Sair
            </button>
          ) : null}
        </div>
      </header>

      <main>
        {syncError ? (
          <p className="past-note tw:mb-[16px]" role="status">
            {syncError}
          </p>
        ) : null}
        {TABS.map((t) => (
          <section className="view" id={`v-${t.id}`} key={t.id} hidden={tab !== t.id}>
            {tab === t.id ? views[t.id] : null}
          </section>
        ))}
      </main>

      <DialogHost />
      <div className={`toast${toastState.show ? ' show' : ''}`} id="toast" role="status">
        <span>{toastState.msg}</span>
        <button
          type="button"
          hidden={!toastState.undo}
          onClick={() => {
            toastState.undo?.()
            setToastState((t) => ({ ...t, undo: undefined, show: false }))
          }}
        >
          Desfazer
        </button>
      </div>
      {info ? (
        <div
          id="info-pop"
          className="info-pop"
          role="tooltip"
          style={{ width: info.width, left: info.left, top: info.top }}
        >
          {info.text}
        </div>
      ) : null}
    </AppContext.Provider>
  )
}
