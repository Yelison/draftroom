import { Radio, useTheme, type ThemePreference } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { themeStore } from '../../theme.ts'
import styles from './Choice.module.css'

const themeOptions = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]

export interface ThemeChoiceProps {
  /** Called after the theme has changed, with the one that was chosen. */
  onChange: (preference: ThemePreference) => void
}

/** Light, dark or the operating system's theme, as one group of radios. */
export function ThemeChoice({ onChange }: ThemeChoiceProps) {
  const intl = useIntl()
  const { preference, setPreference } = useTheme(themeStore)

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>{intl.formatMessage({ id: 'preferences.theme.legend' })}</legend>
      {themeOptions.map((option) => (
        <Radio
          key={option}
          name="theme"
          value={option}
          checked={option === preference}
          onChange={() => {
            setPreference(option)
            onChange(option)
          }}
          label={intl.formatMessage({ id: `preferences.theme.${option}` })}
        />
      ))}
    </fieldset>
  )
}
