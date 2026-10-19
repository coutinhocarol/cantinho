import { useRef, useState } from 'react'
import { useApp } from '../app/context'
import { IconCheck, IconPlus } from '../components/icons'
import { LISTS, KINDS } from '../lib/lists'
import type { ListId } from '../lib/types'

type ListDef = (typeof LISTS)[number]

function ListCard({ L }: { L: ListDef }) {
  const { state, ui, actions, openDialog } = useApp()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const items = state.lists[L.id] || []

  const add = () => {
    const title = text.trim()
    if (!title) {
      inputRef.current?.focus()
      return
    }
    actions.addListItem(L.id, title)
    setText('')
    inputRef.current?.focus()
  }

  return (
    <section className={`list-card${ui.listTab === L.id ? ' active' : ''}`}>
      <div className="sec-head">
        <h2>{L.title}</h2>
      </div>
      <div className="li-add">
        <input
          ref={inputRef}
          className="field"
          placeholder={L.ph}
          aria-label={L.ph}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <button
          type="button"
          className="btn primary li-btn"
          aria-label="Adicionar à lista"
          onClick={add}
        >
          <IconPlus />
        </button>
      </div>
      <div>
        {items.length ? (
          items.map((i) => {
            const k = i.kind ? KINDS[i.kind] : undefined
            return (
              <div className="task" key={i.id}>
                <button
                  className="tick"
                  aria-label="Concluir"
                  onClick={() => actions.doneListItem(L.id, i.id, L.done)}
                >
                  <IconCheck />
                </button>
                <div className="task-body">
                  <div className="task-line">
                    <button
                      className="task-title"
                      onClick={() => openDialog({ kind: 'listItem', list: L.id, id: i.id })}
                    >
                      {i.title}
                    </button>
                    {k || i.note ? (
                      <span className="task-tags">
                        {k ? (
                          <span className="chip" aria-label={k.label}>
                            {k.emoji}
                          </span>
                        ) : null}
                        {i.note ? (
                          <span className="chip" title="Tem nota">
                            📝
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <p className="sub li-empty">{L.empty}</p>
        )}
      </div>
    </section>
  )
}

export function Listas() {
  const { ui, setUi } = useApp()
  return (
    <>
      <div className="board-head">
        <div>
          <h1>Coisinhas</h1>
        </div>
      </div>
      <div className="coisas-wrap">
        <div className="coisas-main">
          <div className="tview list-seg">
            <div className="seg inl">
              {LISTS.map((L) => (
                <button
                  key={L.id}
                  type="button"
                  aria-pressed={ui.listTab === L.id}
                  onClick={() => setUi({ listTab: L.id as ListId })}
                >
                  {L.tab}
                </button>
              ))}
            </div>
          </div>
          <div className="lists-grid">
            {LISTS.map((L) => (
              <ListCard key={L.id} L={L} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
