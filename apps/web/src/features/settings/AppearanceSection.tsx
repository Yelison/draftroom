import type { Schema } from '@draftroom/contract'
import { useTheme, type ThemePreference } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { themeStore } from '../../theme.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { ChoiceGroup } from './ChoiceGroup.tsx'
import { FormStatus } from './FormStatus.tsx'
import { useUpdateMe } from './useUpdateMe.ts'
import styles from './Settings.module.css'

const themes = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]
const textSizes = ['small', 'medium', 'large'] as const satisfies readonly Schema<'EditorTextSize'>[]

/**
 * The theme of the app, which the browser remembers, and the size of the editor text, which the account keeps. A choice is
 * kept as it is made, so this section has no Save of its own and says so.
 */
export function AppearanceSection({ textSize }: { textSize: Schema<'EditorTextSize'> }) {
  const intl = useIntl()
  const { preference, setPreference } = useTheme(themeStore)
  const update = useUpdateMe()
  // What the live region says: the theme changes at once, the text size once the server has stored it.
  const [spoken, setSpoken] = useState<'theme' | null>(null)

  return (
    <section id="settings-appearance" className={styles.section} aria-labelledby="settings-appearance-heading">
      <h2 id="settings-appearance-heading" className={styles.heading}>
        {intl.formatMessage({ id: 'settings.appearance.title' })}
      </h2>
      <div className={styles.pair}>
        <ChoiceGroup
          legend={intl.formatMessage({ id: 'settings.appearance.theme.legend' })}
          name="theme"
          value={preference}
          onChange={(next) => {
            update.reset()
            setPreference(next)
            setSpoken('theme')
          }}
          options={themes.map((option) => ({
            value: option,
            label: intl.formatMessage({ id: `settings.appearance.theme.${option}` }),
          }))}
        />
        <ChoiceGroup
          legend={intl.formatMessage({ id: 'settings.appearance.textSize.legend' })}
          name="text-size"
          value={textSize}
          busy={update.isPending}
          onChange={(next) => {
            setSpoken(null)
            update.mutate({ editorTextSize: next })
          }}
          error={update.error === null ? undefined : intl.formatMessage({ id: problemMessageId(update.error) })}
          options={textSizes.map((option) => ({
            value: option,
            label: intl.formatMessage({ id: `settings.appearance.textSize.${option}` }),
          }))}
        />
      </div>
      <p className={styles.note}>{intl.formatMessage({ id: 'settings.appearance.autosave' })}</p>
      <p role="status" className="forma-visually-hidden">
        {spoken === 'theme' &&
          intl.formatMessage({ id: 'settings.appearance.theme.announcement' }, { theme: preference })}
      </p>
      <FormStatus saved={update.isSuccess ? 'settings.appearance.textSize.saved' : null} failure={null} />
    </section>
  )
}
