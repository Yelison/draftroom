import type { ThemePreference } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { localeNames, type Locale } from '../../i18n/locale.ts'
import { LanguageChoice } from './LanguageChoice.tsx'
import { ThemeChoice } from './ThemeChoice.tsx'
import styles from './PreferencesPanel.module.css'

/** What changed last; the message is built when it is shown, so it is always in the language in use. */
type Change = { kind: 'language'; locale: Locale } | { kind: 'theme'; preference: ThemePreference }

/** The language and theme choices, with a live region that says what changed. */
export function PreferencesPanel() {
  const intl = useIntl()
  const [change, setChange] = useState<Change | null>(null)

  return (
    <section className={styles.panel}>
      <LanguageChoice onChange={(locale) => setChange({ kind: 'language', locale })} />
      <ThemeChoice onChange={(preference) => setChange({ kind: 'theme', preference })} />
      {/* Heard, not seen: the choices already show their own state. The region exists before anything changes: a live region that appears together with its text is not announced. */}
      <p role="status" className="forma-visually-hidden">
        {change?.kind === 'language' &&
          intl.formatMessage({ id: 'preferences.language.announcement' }, { language: localeNames[change.locale] })}
        {change?.kind === 'theme' &&
          intl.formatMessage({ id: 'preferences.theme.announcement' }, { theme: change.preference })}
      </p>
    </section>
  )
}
