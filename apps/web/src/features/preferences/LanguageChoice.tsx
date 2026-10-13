import { Radio } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useLocale } from '../../i18n/useLocale.ts'
import { localeNames, locales, type Locale } from '../../i18n/locale.ts'
import styles from './Choice.module.css'

export interface LanguageChoiceProps {
  /** Called after the language has changed, with the one that was chosen. */
  onChange: (locale: Locale) => void
}

/** The languages of the product as one group of radios; each is named in its own language. */
export function LanguageChoice({ onChange }: LanguageChoiceProps) {
  const intl = useIntl()
  const { locale, setLocale } = useLocale()

  return (
    <fieldset className={styles.group}>
      <legend>{intl.formatMessage({ id: 'preferences.language.legend' })}</legend>
      {locales.map((option) => (
        <Radio
          key={option}
          name="language"
          value={option}
          checked={option === locale}
          onChange={() => {
            setLocale(option)
            onChange(option)
          }}
          label={<span lang={option}>{localeNames[option]}</span>}
        />
      ))}
    </fieldset>
  )
}
