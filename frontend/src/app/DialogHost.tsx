import { useEffect, useRef } from 'react'
import { AreaDialog } from '../dialogs/AreaDialog'
import { EventDialog } from '../dialogs/EventDialog'
import { ListItemDialog, MoveDialog, ScheduleDialog } from '../dialogs/SmallDialogs'
import { TaskDialog } from '../dialogs/TaskDialog'
import { useApp } from './context'

function Content() {
  const { dialog } = useApp()
  if (!dialog) return null
  switch (dialog.kind) {
    case 'area':
      return <AreaDialog id={dialog.id} />
    case 'task':
      return <TaskDialog id={dialog.id} areaId={dialog.areaId} />
    case 'event':
      return <EventDialog id={dialog.id} dateKey={dialog.dateKey} opts={dialog.opts} />
    case 'listItem':
      return <ListItemDialog list={dialog.list} id={dialog.id} />
    case 'schedule':
      return <ScheduleDialog taskId={dialog.taskId} />
    case 'move':
      return <MoveDialog taskId={dialog.taskId} />
  }
}

/** Um único <dialog> nativo; o conteúdo troca conforme o diálogo pedido. */
export function DialogHost() {
  const { dialog, closeDialog } = useApp()
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (dialog && !el.open) el.showModal()
    if (!dialog && el.open) el.close()
  }, [dialog])

  return (
    <dialog
      id="dlg"
      ref={ref}
      onClose={closeDialog}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeDialog()
      }}
      onKeyDown={(e) => {
        const t = e.target as HTMLInputElement
        if (e.key === 'Enter' && t.tagName === 'INPUT' && t.type !== 'number' && !e.nativeEvent.isComposing) {
          ref.current?.querySelector<HTMLElement>('[data-dact="save"]')?.click()
        }
      }}
    >
      {dialog ? <Content key={JSON.stringify(dialog)} /> : null}
    </dialog>
  )
}
