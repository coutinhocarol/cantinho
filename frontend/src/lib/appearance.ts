/** Preferências de aparência, guardadas só neste aparelho. */
export type Theme = 'auto' | 'suave' | 'claro' | 'escuro'

export const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: 'auto', label: 'Automático', hint: 'Suave de dia, escuro se o aparelho estiver no modo escuro' },
  { id: 'suave', label: 'Suave', hint: 'Fundo creme, cores calmas' },
  { id: 'claro', label: 'Claro', hint: 'Fundo quase branco, mais neutro' },
  { id: 'escuro', label: 'Escuro', hint: 'Fundo grafite' },
]

const THEME_KEY = 'cantinho-theme'
const COUNTS_KEY = 'cantinho-counts'

const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* sem armazenamento local */
  }
}

export function getTheme(): Theme {
  const v = read(THEME_KEY)
  return v === 'suave' || v === 'claro' || v === 'escuro' ? v : 'auto'
}

/** Os contadores das seções ficam escondidos, a menos que a pessoa ligue. */
export const getShowCounts = (): boolean => read(COUNTS_KEY) === '1'

const BAR: Record<Theme, string> = { auto: '#f7f3ec', suave: '#f7f3ec', claro: '#f8f9fa', escuro: '#16191d' }

export function applyAppearance(): void {
  const theme = getTheme()
  const root = document.documentElement
  if (theme === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  document.body.classList.toggle('hide-counts', !getShowCounts())
  const bar = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  bar.forEach((m) => {
    if (theme === 'auto') m.content = m.media.includes('dark') ? BAR.escuro : BAR.suave
    else m.content = BAR[theme]
  })
}

export function setTheme(t: Theme): void {
  write(THEME_KEY, t)
  applyAppearance()
}

export function setShowCounts(on: boolean): void {
  write(COUNTS_KEY, on ? '1' : '0')
  applyAppearance()
}
