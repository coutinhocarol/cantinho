const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const IconCheck = () => (
  <svg {...base} strokeWidth="3">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
export const IconSend = () => (
  <svg {...base} strokeWidth="2.4">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconChevL = () => (
  <svg {...base} strokeWidth="2.4">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
export const IconChevR = () => (
  <svg {...base} strokeWidth="2.4">
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const IconGrip = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
)

/** Copo de água (cheio ou vazio). */
export const Glass = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 24 28" aria-hidden="true">
    {on && <path className="wf" d="M4.65 11h14.7l-1.05 13a2.2 2.2 0 0 1-2.2 2H7.9a2.2 2.2 0 0 1-2.2-2L4.65 11z" />}
    <path className="go" d="M4 3h16l-1.7 21a2.2 2.2 0 0 1-2.2 2H7.9a2.2 2.2 0 0 1-2.2-2L4 3z" />
  </svg>
)

/** Florzinha da marca (usa o <symbol id="flower"> do index.html). */
const FlowerUse = () => (
  <svg viewBox="0 0 24 24">
    <use href="#flower" />
  </svg>
)

export const Flower = ({ className = 'flower' }: { className?: string }) => (
  <div className={className} aria-hidden="true">
    <FlowerUse />
  </div>
)

export const TAB_ICONS: Record<string, React.ReactNode> = {
  inicio: (
    <svg {...base} strokeWidth="2">
      <polygon points="13 2 4 14 12 14 11 22 20 10 12 10 13 2" />
    </svg>
  ),
  quadro: (
    <svg {...base} strokeWidth="2">
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </svg>
  ),
  calendario: (
    <svg {...base} strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  ),
  listas: (
    <svg {...base} strokeWidth="2">
      <polygon points="12 2.8 14.9 8.7 21.4 9.6 16.7 14.2 17.8 20.7 12 17.6 6.2 20.7 7.3 14.2 2.6 9.6 9.1 8.7 12 2.8" />
    </svg>
  ),
  areas: (
    <svg {...base} strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  ),
}
