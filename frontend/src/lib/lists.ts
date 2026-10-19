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
    id: 'compras',
    title: 'Compras',
    tab: 'Compras',
    ph: 'Adicionar item…',
    empty: 'Nada na lista de compras.',
    done: 'Item comprado',
  },
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
    done: 'Hobby marcado como experimentado',
  },
]

export const KINDS: Record<KindId, { label: string; emoji: string; done?: string }> = {
  filme: { label: 'Filme', emoji: '🎬', done: 'Marcado como visto' },
  serie: { label: 'Série', emoji: '📺', done: 'Marcado como visto' },
  livro: { label: 'Livro', emoji: '📖', done: 'Marcado como lido' },
  outro: { label: 'Outro', emoji: '✨' },
}
