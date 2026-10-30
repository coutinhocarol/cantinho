import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { Flower, IconPlus } from '../components/icons'
import type { Note } from '../lib/types'
import { fmtWhen, rel } from '../lib/time'

/** Edita uma nota. Guarda o que foi digitado aos poucos, e de vez ao sair da nota. */
function NoteEditor({ note }: { note: Note }) {
  const { actions, setUi } = useApp()
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const latest = useRef({ title, body })
  latest.current = { title, body }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const flush = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    actions.updateNote(note.id, latest.current)
  }
  const queue = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }
  // ao trocar de nota (ou sair da aba) o que ainda não foi guardado é guardado
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!note.title && !note.body) titleRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="notes-editor">
      <div className="notes-bar">
        <button type="button" className="btn ghost notes-back" onClick={() => setUi({ noteId: undefined })}>
          ← Notas
        </button>
        <span className="sub notes-when" title={fmtWhen(note.updatedAt)}>
          {`Editada ${rel(note.updatedAt)}`}
        </span>
        <span className="spacer"></span>
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            flush()
            setUi({ noteId: undefined })
            actions.deleteNote(note.id)
          }}
        >
          Excluir
        </button>
      </div>
      <input
        ref={titleRef}
        className="field notes-title"
        placeholder="Sem título"
        aria-label="Título da nota"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value)
          queue()
        }}
        onBlur={flush}
      />
      <textarea
        className="field notes-body"
        placeholder="Escreva aqui…"
        aria-label="Texto da nota"
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          queue()
        }}
        onBlur={flush}
      />
    </div>
  )
}

export function Notas() {
  const { state, ui, setUi, actions } = useApp()
  const [q, setQ] = useState('')
  const sorted = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)
  const term = q.trim().toLowerCase()
  const shown = term
    ? sorted.filter((n) => (n.title + '\n' + n.body).toLowerCase().includes(term))
    : sorted
  const sel = state.notes.find((n) => n.id === ui.noteId)

  return (
    <>
      <div className="board-head">
        <div>
          <h1>Notas</h1>
        </div>
        <button
          className="btn primary"
          onClick={() => {
            setQ('')
            setUi({ noteId: actions.addNote() })
          }}
        >
          <IconPlus />
          Nova nota
        </button>
      </div>
      {!state.notes.length ? (
        <div className="empty">
          <Flower />
          <strong>Nenhuma nota ainda</strong>
          <p>Crie páginas de texto para guardar anotações, ideias e o que mais quiser lembrar.</p>
        </div>
      ) : (
        <div className={`notes-wrap${sel ? ' has-sel' : ''}`}>
          <div className="notes-side">
            <input
              className="field"
              placeholder="Buscar nas notas"
              aria-label="Buscar nas notas"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="notes-list">
              {shown.length ? (
                shown.map((n) => (
                  <button
                    type="button"
                    key={n.id}
                    className={`note-item${n.id === ui.noteId ? ' on' : ''}`}
                    aria-current={n.id === ui.noteId ? 'true' : undefined}
                    onClick={() => setUi({ noteId: n.id })}
                  >
                    <b>{n.title || 'Sem título'}</b>
                    <span>{n.body.trim().slice(0, 80) || 'Nota vazia'}</span>
                  </button>
                ))
              ) : (
                <p className="sub">Nenhuma nota encontrada.</p>
              )}
            </div>
          </div>
          {sel ? (
            <NoteEditor key={sel.id} note={sel} />
          ) : (
            <p className="sub notes-hint">Escolha uma nota ao lado ou crie uma nova.</p>
          )}
        </div>
      )}
    </>
  )
}
