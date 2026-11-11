import { useState } from 'react'
import { useApp } from '../app/context'
import { THEMES, getShowCounts, getTheme, setShowCounts, setTheme } from '../lib/appearance'
import type { Theme } from '../lib/appearance'

export function AppearanceDialog() {
  const { closeDialog } = useApp()
  const [theme, setT] = useState<Theme>(getTheme())
  const [counts, setC] = useState(getShowCounts())

  return (
    <div className="dlg">
      <h2>Aparência</h2>
      <div>
        <span className="lbl">Tema</span>
        <div className="theme-opts" role="radiogroup" aria-label="Tema">
          {THEMES.map((t) => (
            <label className="theme-opt" key={t.id}>
              <input
                type="radio"
                name="theme"
                checked={theme === t.id}
                onChange={() => {
                  setT(t.id)
                  setTheme(t.id)
                }}
              />
              <span>
                <b>{t.label}</b>
                <span className="sub">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={counts}
            onChange={(e) => {
              setC(e.target.checked)
              setShowCounts(e.target.checked)
            }}
          />{' '}
          Mostrar o número de itens em cada seção
        </label>
        <p className="sub tw:mx-0 tw:mt-[2px] tw:mb-0 tw:text-[13px]">
          Desligado, as seções ficam sem contagem, para a tela parecer menos uma lista de cobranças.
        </p>
      </div>
      <div className="dlg-foot">
        <span className="spacer"></span>
        <button type="button" className="btn primary" onClick={closeDialog}>
          Pronto
        </button>
      </div>
    </div>
  )
}
