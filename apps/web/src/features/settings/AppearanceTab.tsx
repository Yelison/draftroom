import type { Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { useTheme, type ThemePreference } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { themeStore } from '../../theme.ts'
import { retryTransportOnce } from '../documents/queries.ts'
import { meQuery } from '../editor/meQuery.ts'
import { ChoiceGroup } from './ChoiceGroup.tsx'
import { FormStatus } from './FormStatus.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { SettingsSkeleton } from './SettingsSkeleton.tsx'
import { useUpdateMe } from './useUpdateMe.ts'
import styles from './Settings.module.css'

const themes = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]
const textSizes = ['small', 'medium', 'large'] as const satisfies readonly Schema<'EditorTextSize'>[]

/** The theme of the app, which the browser remembers, and the size of the editor text, which the account keeps. */
export function AppearanceTab() {
  const dataSource = useDataSource()
  const me = useQuery({ ...meQuery(dataSource), retry: retryTransportOnce })

  if (me.isError) return <SettingsFailure onRetry={() => void me.refetch()} retrying={me.isFetching} />
  if (me.data === undefined) return <SettingsSkeleton />
  return <Appearance textSize={me.data.editorTextSize} />
}

function Appearance({ textSize }: { textSize: Schema<'EditorTextSize'> }) {
  const intl = useIntl()
  const { preference, setPreference } = useTheme(themeStore)
  const update = useUpdateMe()
  // What the live region says: the theme changes at once, the text size once the server has stored it.
  const [spoken, setSpoken] = useState<'theme' | null>(null)

  return (
    <section className={styles.panel} aria-labelledby="settings-appearance-heading">
      <div>
        <h2 id="settings-appearance-heading" className={styles.heading}>
          {intl.formatMessage({ id: 'settings.appearance.title' })}
        </h2>
        <p className={styles.description}>{intl.formatMessage({ id: 'settings.appearance.description' })}</p>
      </div>
      <div className={styles.form}>
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
          options={textSizes.map((option) => ({
            value: option,
            label: intl.formatMessage({ id: `settings.appearance.textSize.${option}` }),
          }))}
        />
        <p role="status" className="forma-visually-hidden">
          {spoken === 'theme' &&
            intl.formatMessage({ id: 'settings.appearance.theme.announcement' }, { theme: preference })}
        </p>
        <FormStatus saved={update.isSuccess ? 'settings.appearance.textSize.saved' : null} failure={update.error} />
      </div>
    </section>
  )
}
