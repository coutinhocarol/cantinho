/**
 * O texto de uma nota é guardado como uma string. Cada foto ocupa uma linha própria no formato
 * `[[img:id]]`; o resto é texto. O editor trabalha com blocos (texto, foto, texto, foto…).
 */
export type Block = { k: string; t: 'text'; text: string } | { k: string; t: 'img'; id: string }

const IMG_LINE = /^\[\[img:([A-Za-z0-9-]{1,64})\]\]$/

let seq = 0
const key = () => `b${++seq}`

export const textBlock = (text = ''): Block => ({ k: key(), t: 'text', text })
export const imgBlock = (id: string): Block => ({ k: key(), t: 'img', id })

/** Quebra o texto da nota em blocos; sempre há um bloco de texto antes, entre e depois das fotos. */
export function parseBlocks(body: string): Block[] {
  const out: Block[] = []
  let run: string[] = []
  const endRun = () => {
    out.push(textBlock(run.join('\n')))
    run = []
  }
  for (const line of (body || '').split('\n')) {
    const m = IMG_LINE.exec(line.trim())
    if (m) {
      endRun()
      out.push(imgBlock(m[1]))
    } else run.push(line)
  }
  endRun()
  return out
}

export const serializeBlocks = (blocks: Block[]): string =>
  blocks.map((b) => (b.t === 'img' ? `[[img:${b.id}]]` : b.text)).join('\n')

/** Texto da nota sem as referências às fotos (para a lista e a busca). */
export const noteText = (body: string): string =>
  (body || '')
    .split('\n')
    .filter((l) => !IMG_LINE.test(l.trim()))
    .join('\n')

export const hasImages = (body: string): boolean => (body || '').split('\n').some((l) => IMG_LINE.test(l.trim()))

/** Resumo de uma linha para a lista de notas. */
export function noteSnippet(body: string): string {
  const t = noteText(body).replace(/\s+/g, ' ').trim()
  if (t) return t.slice(0, 80)
  return hasImages(body) ? '📷 Foto' : 'Nota vazia'
}

/** Troca o bloco de texto `k` por: texto antes do cursor, as fotos, texto depois. */
export function insertImages(blocks: Block[], k: string, caret: number, ids: string[]): { blocks: Block[]; focus: string } {
  const i = blocks.findIndex((b) => b.k === k && b.t === 'text')
  if (i < 0) {
    // o bloco sumiu enquanto a foto subia: coloca as fotos no fim
    const last = blocks[blocks.length - 1]
    const after = textBlock()
    const next = last && last.t === 'text' ? [...blocks] : [...blocks, textBlock()]
    return { blocks: [...next, ...ids.map(imgBlock), after], focus: after.k }
  }
  const b = blocks[i] as Extract<Block, { t: 'text' }>
  const at = Math.max(0, Math.min(caret, b.text.length))
  const before = { ...b, text: b.text.slice(0, at) }
  const after = textBlock(b.text.slice(at))
  return {
    blocks: [...blocks.slice(0, i), before, ...ids.map(imgBlock), after, ...blocks.slice(i + 1)],
    focus: after.k,
  }
}

/** Remove a foto `k` e junta os textos que ficavam de cada lado dela. */
export function removeImage(blocks: Block[], k: string): { blocks: Block[]; focus: string | null } {
  const i = blocks.findIndex((b) => b.k === k && b.t === 'img')
  if (i < 0) return { blocks, focus: null }
  const prev = blocks[i - 1]
  const next = blocks[i + 1]
  if (prev?.t === 'text' && next?.t === 'text') {
    const merged = { ...prev, text: [prev.text, next.text].filter(Boolean).join('\n') }
    return { blocks: [...blocks.slice(0, i - 1), merged, ...blocks.slice(i + 2)], focus: merged.k }
  }
  return { blocks: blocks.filter((b) => b.k !== k), focus: null }
}
