import type { KindId, ListId } from './types'

export interface ListDef {
  id: ListId
  title: string
  tab: string
  ph: string
  empty: string
  done: string
  kinds?: boolean
}

export const LISTS: ListDef[] = [
  {
    id: 'indicacoes',
    title: 'Indicações',
    tab: 'Indicações',
    ph: 'Adicionar item…',
    empty: 'Nenhuma indicação ainda.',
    done: 'Indicação concluída',
    kinds: true,
  },
  {
    id: 'hobbies',
    title: 'Hobbies para testar',
    tab: 'Hobbies',
    ph: 'Adicionar item…',
    empty: 'Nenhum hobby na lista ainda.',
    done: 'Hobby concluído',
  },
  {
    id: 'compras',
    title: 'Compras',
    tab: 'Compras',
    ph: 'Adicionar item…',
    empty: 'Nada na lista de compras ainda.',
    done: 'Compra concluída',
  },
]

export const KINDS: Record<KindId, { label: string; emoji: string }> = {
  filme: { label: 'Filme', emoji: '🎬' },
  serie: { label: 'Série', emoji: '📺' },
  livro: { label: 'Livro', emoji: '📖' },
  outro: { label: 'Outro', emoji: '✨' },
}

/**
 * Itens de um texto colado (por exemplo, células copiadas do Excel: linhas separadas por quebra de
 * linha, colunas por tabulação). Cada célula não vazia vira um item.
 */
export function itemsFromPaste(text: string): string[] {
  return text
    .split(/[\r\n\t]+/)
    .map((c) => c.trim().replace(/^"(.*)"$/, '$1').trim())
    .filter(Boolean)
}
