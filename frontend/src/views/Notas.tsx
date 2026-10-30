import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/context'
import { Flower, IconPlus } from '../components/icons'
import { imageUrl, prepareImage, uploadImage } from '../lib/images'
import { insertImages, noteSnippet, noteText, parseBlocks, removeImage, serializeBlocks } from '../lib/noteBlocks'
import type { Block } from '../lib/noteBlocks'
import type { Note } from '../lib/types'
import { fmtWhen, rel } from '../lib/time'

/** Edita uma nota. Guarda o que foi digitado aos poucos, e de vez ao sair da nota. */
function NoteEditor({ note }: { note: Note }) {
  const { actions, setUi, toast } = useApp()
  const [title, setTitle] = useState(note.title)
  const [blocks, setBlocks] = useState<Block[]>(() => parseBlocks(note.body))
  const [sending, setSending] = useState(0)
  const latest = useRef({ title, blocks })
  latest.current = { title, blocks }
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const focusNext = useRef<{ k: string; pos: number | 'end' } | null>(null)

  const flush = () => {
    if (!timer.current) return
    clearTimeout(timer.current)
    timer.current = null
    const { title: t, blocks: bs } = latest.current
    actions.updateNote(note.id, { title: t, body: serializeBlocks(bs) })
  }
  const queue = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }
  const edit = (next: Block[]) => {
    latest.current = { ...latest.current, blocks: next }
    setBlocks(next)
    queue()
  }
  // ao trocar de nota (ou sair da aba) o que ainda não foi guardado é guardado
  useEffect(() => flush, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!note.title && !note.body) titleRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // depois de colar uma foto ou mexer nos blocos, devolve o cursor ao lugar certo
  useEffect(() => {
    const f = focusNext.current
    if (!f) return
    focusNext.current = null
    const el = docRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-k="${f.k}"]`)
    if (!el) return
    el.focus()
    const pos = f.pos === 'end' ? el.value.length : f.pos
    el.setSelectionRange(pos, pos)
  })

  const paste = async (e: React.ClipboardEvent<HTMLTextAreaElement>, k: string) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return // texto comum: segue o fluxo normal
    e.preventDefault()
    const caret = e.currentTarget.selectionStart
    setSending((n) => n + files.length)
    try {
      const ids: string[] = []
      for (const f of files) {
        try {
          ids.push(await uploadImage(await prepareImage(f)))
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Não consegui enviar a foto')
        }
      }
      if (ids.length) {
        const r = insertImages(latest.current.blocks, k, caret, ids)
        focusNext.current = { k: r.focus, pos: 0 }
        edit(r.blocks)
        flush()
      }
    } finally {
      setSending((n) => n - files.length)
    }
  }

  /** Seta para cima no começo (ou para baixo no fim) de um texto passa para o texto vizinho, do outro lado da foto. */
  const arrows = (e: React.KeyboardEvent<HTMLTextAreaElement>, i: number) => {
    const el = e.currentTarget
    if (el.selectionStart !== el.selectionEnd) return
    const up = e.key === 'ArrowUp' && el.selectionStart === 0
    const down = e.key === 'ArrowDown' && el.selectionStart === el.value.length
    if (!up && !down) return
    const texts = blocks.map((b, j) => ({ b, j })).filter((x) => x.b.t === 'text')
    const t = up ? texts.filter((x) => x.j < i).pop() : texts.find((x) => x.j > i)
    if (!t) return
    e.preventDefault()
    focusNext.current = { k: t.b.k, pos: up ? 'end' : 0 }
    setBlocks((bs) => [...bs]) // força o efeito acima
  }

  const onlyText = blocks.length === 1

  return (
    <div className="notes-editor">
      <div className="notes-bar">
        <button type="button" className="btn ghost notes-back" onClick={() => setUi({ noteId: undefined })}>
          ← Notas
        </button>
        <span className="sub notes-when" title={fmtWhen(note.updatedAt)}>
          {sending ? 'Enviando foto…' : `Editada ${rel(note.updatedAt)}`}
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
          latest.current = { ...latest.current, title: e.target.value }
          queue()
        }}
        onBlur={flush}
      />
      <div className="notes-doc" ref={docRef}>
        {blocks.map((b, i) =>
          b.t === 'img' ? (
            <figure className="note-img" key={b.k}>
              <a href={imageUrl(b.id)} target="_blank" rel="noopener noreferrer">
                <img src={imageUrl(b.id)} alt="Foto da nota" loading="lazy" />
              </a>
              <button
                type="button"
                className="note-img-x"
                aria-label="Remover foto"
                title="Remover foto"
                onClick={() => {
                  const r = removeImage(blocks, b.k)
                  if (r.focus) focusNext.current = { k: r.focus, pos: 'end' }
                  edit(r.blocks)
                  flush()
                }}
              >
                ×
              </button>
            </figure>
          ) : (
            <textarea
              key={b.k}
              data-k={b.k}
              className={`note-block${i === blocks.length - 1 ? ' last' : ''}`}
              aria-label={i === 0 ? 'Texto da nota' : 'Continuação do texto da nota'}
              placeholder={onlyText ? 'Escreva aqui… (Ctrl+V cola fotos)' : ''}
              value={b.text}
              onChange={(e) => edit(blocks.map((x) => (x.k === b.k ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => arrows(e, i)}
              onPaste={(e) => void paste(e, b.k)}
              onBlur={flush}
            />
          ),
        )}
      </div>
    </div>
  )
}

export function Notas() {
  const { state, ui, setUi, actions } = useApp()
  const [q, setQ] = useState('')
  const sorted = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)
  const term = q.trim().toLowerCase()
  const shown = term
    ? sorted.filter((n) => (n.title + '\n' + noteText(n.body)).toLowerCase().includes(term))
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
                    <span>{noteSnippet(n.body)}</span>
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
