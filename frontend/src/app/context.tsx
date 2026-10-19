import { createContext, useContext } from 'react'
import type { Actions } from '../lib/actions'
import type { Store } from '../lib/store'
import type { AppState, ListId } from '../lib/types'

export type TabId = 'inicio' | 'quadro' | 'calendario' | 'listas' | 'areas'

export interface UiState {
  tview: 'area' | 'matriz'
  calView: 'mes' | 'semana'
  calSel: string
  calMonth: { y: number; m: number }
  listTab: ListId
  lastArea?: string
}

export type DialogState =
  | { kind: 'area'; id: string | null }
  | { kind: 'task'; id: string | null; areaId?: string }
  | {
      kind: 'event'
      id: string | null
      dateKey?: string
      opts?: { title?: string; linkTaskId?: string }
    }
  | { kind: 'listItem'; list: ListId; id: string }
  | { kind: 'waterGoal' }
  | { kind: 'schedule'; taskId: string }
  | { kind: 'move'; taskId: string }
  | null

export interface AppCtx {
  store: Store
  state: AppState
  commit: Store['commit']
  actions: Actions
  toast: (msg: string, undo?: () => void) => void
  ui: UiState
  setUi: (patch: Partial<UiState>) => void
  tab: TabId
  setTab: (t: TabId) => void
  dialog: DialogState
  openDialog: (d: Exclude<DialogState, null>) => void
  closeDialog: () => void
  showInfo: (btn: HTMLElement, text: string) => void
  /** Tem um arrasto de área/compromisso em andamento (pausa a atualização automática). */
  dragging: React.MutableRefObject<boolean>
}

export const AppContext = createContext<AppCtx | null>(null)

export function useApp(): AppCtx {
  const c = useContext(AppContext)
  if (!c) throw new Error('useApp fora do AppContext')
  return c
}
