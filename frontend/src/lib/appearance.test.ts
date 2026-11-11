import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyAppearance, getShowCounts, getTheme, setShowCounts, setTheme } from './appearance'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.body.className = ''
})
afterEach(() => localStorage.clear())

describe('appearance', () => {
  it('por padrão: tema automático e contadores escondidos', () => {
    expect(getTheme()).toBe('auto')
    expect(getShowCounts()).toBe(false)
    applyAppearance()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(document.body.classList.contains('hide-counts')).toBe(true)
  })

  it('escolher um tema grava e aplica; automático remove o atributo', () => {
    setTheme('escuro')
    expect(getTheme()).toBe('escuro')
    expect(document.documentElement.getAttribute('data-theme')).toBe('escuro')
    setTheme('suave')
    expect(document.documentElement.getAttribute('data-theme')).toBe('suave')
    setTheme('auto')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('ligar os contadores tira a classe que os esconde', () => {
    setShowCounts(true)
    expect(getShowCounts()).toBe(true)
    expect(document.body.classList.contains('hide-counts')).toBe(false)
    setShowCounts(false)
    expect(document.body.classList.contains('hide-counts')).toBe(true)
  })

  it('valor guardado inválido volta para automático', () => {
    localStorage.setItem('cantinho-theme', 'roxo')
    expect(getTheme()).toBe('auto')
  })
})
