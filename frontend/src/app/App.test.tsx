import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { StateApi } from '../lib/api'
import { emptyState } from '../lib/state'
import { LS_KEY, Store } from '../lib/store'
import type { AppState, Area, CalEvent, Task } from '../lib/types'
import { DAY, ymd } from '../lib/time'
import App from './App'

const now = () => Date.now()

const area = (id: string, name: string, over: Partial<Area> = {}): Area => ({
  id,
  name,
  emoji: '🏠',
  period: { type: 'interval', every: 7, unit: 'days' },
  lastDone: now() - 2 * DAY,
  history: [],
  createdAt: now() - 30 * DAY,
  order: 0,
  ...over,
})

const task = (id: string, title: string, areaId: string, over: Partial<Task> = {}): Task => ({
  id,
  title,
  areaId,
  notes: '',
  due: '',
  done: false,
  doneAt: null,
  createdAt: now(),
  ...over,
})

function setup(seed?: (s: AppState) => void) {
  const s = emptyState()
  s.water = { goal: 10, date: ymd(new Date()), count: 0, v2: true }
  seed?.(s)
  localStorage.setItem(LS_KEY, JSON.stringify(s))
  const api: StateApi = { load: vi.fn(async () => null), save: vi.fn(async () => {}) }
  const store = new Store({ api })
  const user = userEvent.setup()
  render(<App store={store} />)
  return { store, user, api }
}

const goTo = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('tab', { name }))

describe('Início (Bora)', () => {
  it('sem áreas: convida a usar exemplos e os exemplos viram dados reais', async () => {
    const { user, store } = setup()
    expect(screen.getByText('Nenhuma área ainda')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Usar exemplos' }))
    expect(store.getState().areas.map((a) => a.name)).toEqual(['Quarto', 'Plantas', 'Cozinha', 'Finanças'])
    expect(screen.getByText(/Exemplos adicionados/)).toBeInTheDocument()
    expect(screen.getByText('Trocar a roupa de cama')).toBeInTheDocument()
  })

  it('mostra o cumprimento e as seções do dia', () => {
    setup((s) => void s.areas.push(area('a', 'Quarto', { lastDone: null })))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite)!$/)
    for (const h of ['Compromissos de hoje', 'Água de hoje', 'Áreas a checar', 'Tarefas pendentes', 'Tarefas a organizar'])
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
  })

  it('checar uma área pendente a tira da lista e permite desfazer', async () => {
    const { user, store } = setup((s) => void s.areas.push(area('a', 'Quarto', { lastDone: null })))
    expect(screen.getByText('Ainda não checada')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Checar Quarto' }))
    expect(store.getState().areas[0].lastDone).not.toBeNull()
    expect(screen.getByText(/Quarto checada às/)).toBeInTheDocument()
    expect(screen.getByText('Todas as áreas estão em dia.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(store.getState().areas[0].lastDone).toBeNull()
    expect(screen.getByText('Ainda não checada')).toBeInTheDocument()
  })

  it('tarefas Fazer/Simplificar ficam em pendentes; sem classificação vai para organizar', () => {
    setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(
        task('1', 'Lavar roupa', 'a', { quad: 'fazer' }),
        task('2', 'Simplificar contas', 'a', { quad: 'delegar' }),
        task('3', 'Pensar na viagem', 'a'),
        task('4', 'Planejar mudança', 'a', { quad: 'agendar' }),
        task('5', 'Cortar assinaturas', 'a', { quad: 'eliminar' }),
      )
    })
    const pend = screen.getByRole('heading', { name: 'Tarefas pendentes' }).closest('div')!.parentElement!
    expect(within(pend).getByText('Lavar roupa')).toBeInTheDocument()
    expect(within(pend).getByText('Simplificar contas')).toBeInTheDocument()
    expect(within(pend).queryByText('Pensar na viagem')).not.toBeInTheDocument()
    const org = screen.getByRole('heading', { name: 'Tarefas a organizar' }).closest('div')!.parentElement!
    expect(within(org).getByText('Pensar na viagem')).toBeInTheDocument()
    expect(within(org).getByText('Planejar mudança')).toBeInTheDocument()
    expect(within(org).getByText('Sem compromisso')).toBeInTheDocument()
    expect(within(org).getByText('Sem classificação')).toBeInTheDocument()
    // Eliminar não aparece em nenhuma lista do Bora
    expect(screen.queryByText('Cortar assinaturas')).not.toBeInTheDocument()
  })

  it('concluir tarefa remove e o "Desfazer" traz de volta', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('1', 'Lavar roupa', 'a', { quad: 'fazer' }))
    })
    await user.click(screen.getByRole('button', { name: 'Concluir tarefa' }))
    expect(store.getState().tasks).toEqual([])
    expect(screen.getByText('Tarefa concluída')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(store.getState().tasks.map((t) => t.title)).toEqual(['Lavar roupa'])
  })

  it('água: clicar no copo N enche até N; clicar no último cheio esvazia um', async () => {
    const { user, store } = setup((s) => void s.areas.push(area('a', 'Quarto')))
    await user.click(screen.getByRole('button', { name: 'Copo 3 de 10' }))
    expect(store.getState().water.count).toBe(3)
    expect(screen.getByRole('button', { name: 'Copo 3 de 10' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Copo 4 de 10' })).toHaveAttribute('aria-pressed', 'false')
    await user.click(screen.getByRole('button', { name: 'Copo 3 de 10' }))
    expect(store.getState().water.count).toBe(2)
  })

  it('meta de água: valida entre 1 e 30', async () => {
    const { user, store } = setup((s) => void s.areas.push(area('a', 'Quarto')))
    await user.click(screen.getByRole('button', { name: /Meta \(2,5 L\)/ }))
    const input = screen.getByLabelText('Quantos copos por dia?')
    await user.clear(input)
    await user.type(input, '99')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.getState().water.goal).toBe(30)
    expect(screen.getByRole('button', { name: /Meta \(7,5 L\)/ })).toBeInTheDocument()
  })

  it('tudo em dia mostra o aviso "Tudo certo por hoje"', async () => {
    const { user } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.water.count = 10
    })
    expect(screen.getByText('Tudo certo por hoje')).toBeInTheDocument()
    await goTo(user, 'Áreas')
    expect(screen.queryByText('Tudo certo por hoje')).not.toBeInTheDocument()
  })

  it('compromissos de hoje aparecem e podem ser concluídos', async () => {
    const e: CalEvent = {
      id: 'e1',
      title: 'Dentista',
      date: ymd(new Date()),
      allDay: false,
      start: '23:30',
      end: '',
      repeat: 'none',
      notes: '',
      createdAt: 0,
      origin: ymd(new Date()),
    }
    const { user, store } = setup((s) => void s.events.push(e))
    expect(screen.getByText('Dentista')).toBeInTheDocument()
    expect(screen.getByText('23:30')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Marcar compromisso como feito' }))
    expect(store.getState().events).toEqual([])
    expect(screen.getByText('Compromisso concluído')).toBeInTheDocument()
  })
})

describe('Áreas', () => {
  it('cria uma área pelo diálogo e valida o nome', async () => {
    const { user, store } = setup()
    await goTo(user, 'Áreas')
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Todo dia'.replace('Todo dia', 'A cada 7 dias'))).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Criar área' }))
    expect(store.getState().areas).toHaveLength(0) // sem nome não salva
    await user.type(within(dialog).getByLabelText('Emoji da área'), '🌿x')
    await user.type(within(dialog).getByPlaceholderText('Ex.: Quarto'), 'Jardim')
    const every = within(dialog).getByRole('spinbutton')
    await user.clear(every)
    await user.type(every, '3')
    expect(within(dialog).getByText('A cada 3 dias', { selector: '.preview' })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Criar área' }))
    const a = store.getState().areas[0]
    expect(a).toMatchObject({ name: 'Jardim', emoji: '🌿', period: { type: 'interval', every: 3, unit: 'days' }, lastDone: null, order: 0 })
    expect(screen.getByText('Jardim')).toBeInTheDocument()
  })

  it('Enter dentro do diálogo salva', async () => {
    const { user, store } = setup()
    await goTo(user, 'Áreas')
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    await user.type(screen.getByPlaceholderText('Ex.: Quarto'), 'Cozinha{Enter}')
    expect(store.getState().areas.map((a) => a.name)).toEqual(['Cozinha'])
  })

  it('periodicidade por dias da semana exige ao menos um dia', async () => {
    const { user, store } = setup()
    await goTo(user, 'Áreas')
    await user.click(screen.getByRole('button', { name: /Nova área/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByPlaceholderText('Ex.: Quarto'), 'Plantas')
    await user.click(within(dialog).getByRole('button', { name: 'Dias da semana' }))
    expect(within(dialog).getByText('Toda terça às 21:00')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ter' })) // desmarca
    expect(within(dialog).getByText('Escolha os dias')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Criar área' }))
    expect(within(dialog).getByText('Escolha pelo menos um dia da semana.')).toBeInTheDocument()
    expect(store.getState().areas).toHaveLength(0)
    await user.click(within(dialog).getByRole('button', { name: 'Qua' }))
    await user.click(within(dialog).getByRole('button', { name: 'Criar área' }))
    expect(store.getState().areas[0].period).toEqual({ type: 'weekly', days: [3], time: '21:00' })
  })

  it('excluir pede confirmação; as tarefas ficam sem área e o desfazer devolve tudo', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('1', 'Lavar roupa', 'a', { quad: 'fazer' }))
    })
    await goTo(user, 'Áreas')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: 'Excluir' }))
    expect(store.getState().areas).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Toque de novo para excluir' }))
    expect(store.getState().areas).toHaveLength(0)
    expect(store.getState().tasks).toMatchObject([{ title: 'Lavar roupa', areaId: '' }])
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(store.getState().areas).toHaveLength(1)
    expect(store.getState().tasks[0].areaId).toBe('a')
  })

  it('não deixa desligar "Aceita tarefas" se ainda há tarefas', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('1', 'Lavar roupa', 'a'))
    })
    await goTo(user, 'Áreas')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByLabelText('Aceita tarefas'))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByRole('alert', { name: '' })).toBeDefined()
    expect(screen.getByText(/Essa área ainda tem 1 tarefa\./)).toBeInTheDocument()
    expect(store.getState().areas[0].acceptsTasks).toBeUndefined()
  })

  it('"Mandar pra checar" e "Mandar todas pra checar"', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'), area('b', 'Cozinha', { order: 1 }))
    })
    await goTo(user, 'Áreas')
    await user.click(screen.getAllByRole('button', { name: 'Mandar pra checar' })[0])
    expect(store.getState().areas.find((a) => a.id === 'a')!.forceDue).toBeTypeOf('number')
    expect(screen.getByText('Quarto voltou para A checar')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mandar todas pra checar' }))
    expect(store.getState().areas.every((a) => a.forceDue)).toBe(true)
    expect(screen.getByRole('button', { name: 'Mandar todas pra checar' })).toBeDisabled()
  })

  it('reordenar com as setas do teclado', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'), area('b', 'Cozinha', { order: 1 }))
    })
    await goTo(user, 'Áreas')
    const grip = screen.getByRole('button', { name: /Reordenar Quarto/ })
    grip.focus()
    await user.keyboard('{ArrowDown}')
    expect(store.getState().areas.map((a) => [a.id, a.order])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
    expect(screen.getByRole('button', { name: /Reordenar Quarto/ })).toHaveFocus()
  })
})

describe('Tarefas', () => {
  it('cria tarefa na área e classifica em Agendar abrindo a ligação com compromisso', async () => {
    const { user, store } = setup((s) => void s.areas.push(area('a', 'Quarto')))
    await goTo(user, 'Tarefas')
    await user.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Tarefa'), 'Organizar armário')
    await user.selectOptions(within(dialog).getByLabelText('Matriz de priorização'), 'agendar')
    expect(within(dialog).getByText('Obrigatório em Agendar: ligue a um compromisso.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(store.getState().tasks[0]).toMatchObject({ title: 'Organizar armário', areaId: 'a', quad: 'agendar', done: false })
    // abre "Agendar tarefa"
    expect(screen.getByRole('heading', { name: 'Agendar tarefa' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.getByText('Sem compromisso')).toBeInTheDocument()
  })

  it('"+ Criar novo compromisso" cria o evento já ligado à tarefa', async () => {
    const { user, store } = setup((s) => void s.areas.push(area('a', 'Quarto')))
    await goTo(user, 'Tarefas')
    await user.click(screen.getByRole('button', { name: /Nova tarefa/ }))
    await user.type(screen.getByLabelText('Tarefa'), 'Ligar pro dentista')
    await user.selectOptions(screen.getByLabelText('Compromisso no calendário'), '__new')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(screen.getByRole('heading', { name: 'Novo compromisso' })).toBeInTheDocument()
    expect(screen.getByLabelText('Compromisso')).toHaveValue('Ligar pro dentista')
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    const s = store.getState()
    expect(s.events).toHaveLength(1)
    expect(s.tasks[0].eventId).toBe(s.events[0].id)
  })

  it('matriz: mover pelo diálogo e voltar para "Sem classificação"', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('1', 'Lavar roupa', 'a'))
    })
    await goTo(user, 'Tarefas')
    await user.click(screen.getByRole('button', { name: 'Matriz de priorização' }))
    expect(localStorage.getItem('cantinho-tview')).toBe('matriz')
    await user.click(screen.getByRole('button', { name: 'Lavar roupa' }))
    await user.click(document.querySelector('.mv-btn.q-fazer') as HTMLElement)
    expect(store.getState().tasks[0].quad).toBe('fazer')
    const q1 = document.querySelector('.quad.q-fazer') as HTMLElement
    expect(within(q1).getByText('Lavar roupa')).toBeInTheDocument()
    await user.click(within(q1).getByRole('button', { name: 'Lavar roupa' }))
    await user.click(screen.getByRole('button', { name: /Sem classificação/ }))
    expect(store.getState().tasks[0].quad).toBe('')
  })

  it('arrastar da bandeja para um quadrante classifica a tarefa', () => {
    const { store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('1', 'Lavar roupa', 'a'))
    })
    localStorage.setItem('cantinho-tview', 'matriz')
    act(() => screen.getByRole('tab', { name: 'Tarefas' }).click())
    act(() => screen.getByRole('button', { name: 'Matriz de priorização' }).click())
    const card = screen.getByRole('button', { name: 'Lavar roupa' }).closest('.qcard')!
    const target = document.querySelector('.quad.q-eliminar')!
    const dt = { effectAllowed: '', setData: vi.fn() }
    const fire = (el: Element, type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(ev, { dataTransfer: dt })
      act(() => void el.dispatchEvent(ev))
    }
    fire(card, 'dragstart')
    fire(target, 'dragover')
    expect(target).toHaveClass('drop')
    fire(target, 'drop')
    expect(store.getState().tasks[0].quad).toBe('eliminar')
  })

  it('sem áreas que aceitam tarefas, explica e leva para Áreas', async () => {
    const { user } = setup((s) => void s.areas.push(area('a', 'Quarto', { acceptsTasks: false })))
    await goTo(user, 'Tarefas')
    expect(screen.getByText('Nenhuma área aceita tarefas')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ir para Áreas' }))
    expect(screen.getByRole('heading', { name: 'Áreas' })).toBeInTheDocument()
  })

  it('arrastar um cartão para outra coluna muda a área da tarefa', () => {
    const { store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'), area('b', 'Cozinha', { order: 1 }))
      s.tasks.push(task('1', 'Lavar roupa', 'a'))
    })
    act(() => screen.getByRole('tab', { name: 'Tarefas' }).click())
    const card = document.querySelector('[data-task="1"]')!
    const col = document.querySelector('[data-col="b"]')!
    const dt = { effectAllowed: '', setData: vi.fn() }
    const fire = (el: Element, type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(ev, { dataTransfer: dt })
      act(() => void el.dispatchEvent(ev))
    }
    fire(card, 'dragstart')
    fire(col, 'dragover')
    expect(col).toHaveClass('drop')
    fire(col, 'drop')
    expect(store.getState().tasks[0].areaId).toBe('b')
  })
})

describe('Tarefas sem área', () => {
  const orphanSeed = (s: AppState) => {
    s.areas.push(area('a', 'Quarto'))
    s.tasks.push(
      task('1', 'Tarefa solta', '', { quad: 'fazer' }),
      task('2', 'Outra solta', '', {}),
      task('3', 'Com área', 'a', { quad: 'fazer' }),
    )
  }

  it('aparecem no Bora (pendentes e a organizar)', () => {
    setup(orphanSeed)
    expect(screen.getByText('Tarefa solta')).toBeInTheDocument()
    expect(screen.getByText('Outra solta')).toBeInTheDocument()
    const pend = screen.getByRole('heading', { name: 'Tarefas pendentes' }).closest('div')!.parentElement!
    expect(within(pend).getByText('Com área')).toBeInTheDocument()
    expect(within(pend).getByText('Tarefa solta')).toBeInTheDocument()
  })

  it('ficam numa coluna "Sem área" e podem ser arrastadas para uma área', () => {
    const { store } = setup(orphanSeed)
    act(() => screen.getByRole('tab', { name: 'Tarefas' }).click())
    const col = document.querySelector('[data-col=""]') as HTMLElement
    expect(within(col).getByText('Sem área')).toBeInTheDocument()
    expect(within(col).getByText('Tarefa solta')).toBeInTheDocument()
    const card = document.querySelector('[data-task="1"]')!
    const target = document.querySelector('[data-col="a"]')!
    const dt = { effectAllowed: '', setData: vi.fn() }
    const fire = (el: Element, type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true })
      Object.assign(ev, { dataTransfer: dt })
      act(() => void el.dispatchEvent(ev))
    }
    fire(card, 'dragstart')
    fire(target, 'dragover')
    fire(target, 'drop')
    expect(store.getState().tasks.find((t) => t.id === '1')!.areaId).toBe('a')
  })

  it('a coluna "Sem área" some quando não há tarefas soltas', async () => {
    const { user } = setup((s) => void s.areas.push(area('a', 'Quarto')))
    await goTo(user, 'Tarefas')
    expect(document.querySelector('[data-col=""]')).toBeNull()
  })

  it('aparecem na matriz como "Sem área"', async () => {
    const { user } = setup(orphanSeed)
    await goTo(user, 'Tarefas')
    await user.click(screen.getByRole('button', { name: 'Matriz de priorização' }))
    const card = screen.getByRole('button', { name: 'Tarefa solta' }).closest('.qcard') as HTMLElement
    expect(within(card).getByText('Sem área')).toBeInTheDocument()
  })

  it('o diálogo permite tirar a tarefa da área e escolher outra de novo', async () => {
    const { user, store } = setup((s) => {
      s.areas.push(area('a', 'Quarto'))
      s.tasks.push(task('3', 'Com área', 'a', { quad: 'fazer' }))
    })
    await goTo(user, 'Tarefas')
    await user.click(screen.getByRole('button', { name: 'Com área' }))
    await user.selectOptions(screen.getByLabelText('Área'), '')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.getState().tasks[0].areaId).toBe('')
    await user.click(screen.getByRole('button', { name: 'Com área' }))
    await user.selectOptions(screen.getByLabelText('Área'), 'a')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.getState().tasks[0].areaId).toBe('a')
  })
})

describe('Calendário', () => {
  it('cria compromisso, valida campos e mostra na lista do dia', async () => {
    const { user, store } = setup()
    await goTo(user, 'Calendário')
    const today = new Date()
    expect(screen.getByText('Nenhum compromisso neste dia.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Compromisso$/ }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(within(dialog).getByText('Dê um nome ao compromisso.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Compromisso'), 'Reunião')
    const end = within(dialog).getByLabelText('Fim (opcional)')
    await user.clear(end)
    await user.type(end, '08:00')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(within(dialog).getByText('O fim precisa ser depois do início.')).toBeInTheDocument()
    await user.clear(end)
    await user.type(end, '10:30')
    await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))
    expect(store.getState().events[0]).toMatchObject({
      title: 'Reunião',
      date: ymd(today),
      start: '09:00',
      end: '10:30',
      repeat: 'none',
      allDay: false,
    })
    const side = document.querySelector('.cal-side') as HTMLElement
    expect(within(side).getByText('Reunião')).toBeInTheDocument()
    expect(within(side).getByText('Hoje')).toBeInTheDocument()
  })

  it('dia inteiro dispensa horário', async () => {
    const { user, store } = setup()
    await goTo(user, 'Calendário')
    await user.click(screen.getByRole('button', { name: /^Compromisso$/ }))
    await user.type(screen.getByLabelText('Compromisso'), 'Feriado')
    await user.click(screen.getByLabelText('Dia inteiro'))
    await user.click(screen.getByRole('button', { name: 'Adicionar' }))
    expect(store.getState().events[0]).toMatchObject({ allDay: true, start: '', end: '' })
  })

  it('alterna entre mês e semana e lembra a escolha', async () => {
    const { user } = setup()
    await goTo(user, 'Calendário')
    expect(document.querySelector('.cal')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Semana' }))
    expect(document.querySelectorAll('.wk-day')).toHaveLength(7)
    expect(localStorage.getItem('cantinho-calview')).toBe('semana')
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mês' }))
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeInTheDocument()
  })

  it('navegar de mês muda o título', async () => {
    const { user } = setup()
    await goTo(user, 'Calendário')
    const title = () => document.querySelector('.cal-title')!.textContent
    const first = title()
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(title()).not.toBe(first)
    await user.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(title()).toBe(first)
  })

  it('dias passados não aceitam compromisso', async () => {
    const { user } = setup()
    await goTo(user, 'Calendário')
    await user.click(screen.getByRole('button', { name: 'Semana' }))
    const past = document.querySelector('.wk-day.past')
    if (past) expect(within(past as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
  })

  it('semanal: concluir um dia só marca aquele dia', async () => {
    const tk = ymd(new Date())
    const e: CalEvent = {
      id: 'e1', title: 'Yoga', date: tk, allDay: false, start: '19:00', end: '', repeat: 'weekly', notes: '', createdAt: 0, origin: tk,
    }
    const { user, store } = setup((s) => void s.events.push(e))
    await goTo(user, 'Calendário')
    const side = document.querySelector('.cal-side') as HTMLElement
    await user.click(within(side).getByRole('button', { name: 'Marcar como feito' }))
    expect(store.getState().events[0].doneDates).toEqual([tk])
    expect(screen.getByText('Compromisso concluído')).toBeInTheDocument()
  })
})

describe('Coisinhas', () => {
  it('adiciona item pelo Enter, conclui e desfaz', async () => {
    const { user, store } = setup()
    await goTo(user, 'Coisinhas')
    const input = document.querySelector('.list-card.active input') as HTMLInputElement
    await user.type(input, 'Leite{Enter}')
    expect(store.getState().lists.compras.map((i) => i.title)).toEqual(['Leite'])
    expect(input).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(store.getState().lists.compras).toEqual([])
    expect(screen.getByText('Item comprado')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(store.getState().lists.compras).toHaveLength(1)
  })

  it('troca de lista e edita uma indicação com emoji e nota', async () => {
    const { user, store } = setup((s) => void s.lists.indicacoes.push({ id: 'i', title: 'Parasita', createdAt: 1 }))
    await goTo(user, 'Coisinhas')
    await user.click(screen.getByRole('button', { name: 'Indicações' }))
    await user.click(screen.getByRole('button', { name: 'Parasita' }))
    await user.selectOptions(screen.getByLabelText('Emoji'), 'filme')
    await user.type(screen.getByLabelText('Notas'), 'Netflix')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(store.getState().lists.indicacoes[0]).toMatchObject({ kind: 'filme', note: 'Netflix' })
    expect(screen.getByLabelText('Filme')).toHaveTextContent('🎬')
  })

  it('item vazio não é adicionado', async () => {
    const { user, store } = setup()
    await goTo(user, 'Coisinhas')
    await user.click(screen.getAllByRole('button', { name: 'Adicionar à lista' })[0])
    expect(store.getState().lists.compras).toEqual([])
  })
})

describe('Sincronização', () => {
  it('as mudanças vão para a conta pela API depois de conectar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { user, api } = setup()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
      await goTo(user, 'Áreas')
      await user.click(screen.getByRole('button', { name: /Nova área/ }))
      await user.type(screen.getByPlaceholderText('Ex.: Quarto'), 'Quarto{Enter}')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700)
      })
      expect(api.save).toHaveBeenCalled()
      const sent = vi.mocked(api.save).mock.calls.at(-1)![0]
      expect(sent.areas[0].name).toBe('Quarto')
    } finally {
      vi.useRealTimers()
    }
  })
})
