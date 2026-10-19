const HOUR = 36e5
export const DAY = 864e5
export const WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const WD_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const seg =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export const firstChar = (v: string | null | undefined): string => {
  v = (v || '').trim()
  if (!v) return ''
  return seg ? [...seg.segment(v)][0].segment : Array.from(v)[0]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (k: string) => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0)
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n))

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
export function rel(t: number, now = Date.now()): string {
  const d = t - now
  const a = Math.abs(d)
  if (a < 60e3) return 'agora'
  if (a < HOUR) return rtf.format(Math.round(d / 60e3), 'minute')
  if (a < DAY) return rtf.format(Math.round(d / HOUR), 'hour')
  if (a < 30 * DAY) return rtf.format(Math.round(d / DAY), 'day')
  return rtf.format(Math.round(d / (30 * DAY)), 'month')
}

export const fmtWhen = (t: number) =>
  new Date(t).toLocaleString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

export const fmtDayMonth = (d: Date) =>
  d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function atTime(d: Date | number, hhmm: string): number {
  const [h, m] = (hhmm || '00:00').split(':').map(Number)
  const x = new Date(d)
  x.setHours(h || 0, m || 0, 0, 0)
  return x.getTime()
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
