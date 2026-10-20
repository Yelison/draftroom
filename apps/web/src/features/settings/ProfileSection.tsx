import { contractLimits, type Schema } from '@draftroom/contract'
import { Input } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { localeNames, locales } from '../../i18n/locale.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { ChoiceGroup } from './ChoiceGroup.tsx'
import type { SettingsForm } from './useSettingsForm.ts'
import styles from './Settings.module.css'

/** The name, the email (which is read, not changed) and the language of the signed-in person, which their account keeps. */
export function ProfileSection({ me, form }: { me: Schema<'Me'>; form: SettingsForm }) {
  const intl = useIntl()
  const { problems, failures } = form
  const nameError =
    problems.name !== null
      ? intl.formatMessage({ id: `settings.profile.name.${problems.name}` }, { max: contractLimits.personName.max })
      : failures.name !== null
        ? intl.formatMessage({ id: problemMessageId(failures.name) })
        : undefined

  return (
    <section id="settings-profile" className={styles.section} aria-labelledby="settings-profile-heading">
      <h2 id="settings-profile-heading" className={styles.heading}>
        {intl.formatMessage({ id: 'settings.profile.title' })}
      </h2>
      <div className={styles.pair}>
        <Input
          label={intl.formatMessage({ id: 'settings.profile.name.label' })}
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          error={nameError}
        />
        <Input label={intl.formatMessage({ id: 'settings.profile.email.label' })} value={me.email} readOnly />
      </div>
      <ChoiceGroup
        legend={intl.formatMessage({ id: 'settings.profile.language.legend' })}
        name="language"
        value={form.locale}
        busy={form.pending}
        inline
        onChange={form.setLocale}
        error={failures.language === null ? undefined : intl.formatMessage({ id: problemMessageId(failures.language) })}
        options={locales.map((option) => ({
          value: option,
          label: <span lang={option}>{localeNames[option]}</span>,
        }))}
      />
    </section>
  )
}
