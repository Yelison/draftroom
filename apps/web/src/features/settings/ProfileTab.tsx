import { contractLimits, type Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button, Input } from '@yelison/forma-ui'
import { useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { localeNames, locales, type Locale } from '../../i18n/locale.ts'
import { useLocale } from '../../i18n/useLocale.ts'
import { textProblem, type TextProblem } from '../documents/actions/textProblem.ts'
import { meQuery } from '../editor/meQuery.ts'
import { retryTransportOnce } from '../documents/queries.ts'
import { ChoiceGroup } from './ChoiceGroup.tsx'
import { FormStatus } from './FormStatus.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { SettingsSkeleton } from './SettingsSkeleton.tsx'
import { useUpdateMe } from './useUpdateMe.ts'
import styles from './Settings.module.css'

/** The name and the language of the signed-in person, which are kept on their account. */
export function ProfileTab() {
  const dataSource = useDataSource()
  const me = useQuery({ ...meQuery(dataSource), retry: retryTransportOnce })

  if (me.isError) return <SettingsFailure onRetry={() => void me.refetch()} retrying={me.isFetching} />
  if (me.data === undefined) return <SettingsSkeleton />
  return <ProfileForm me={me.data} />
}

function ProfileForm({ me }: { me: Schema<'Me'> }) {
  const intl = useIntl()
  const { locale: appLocale } = useLocale()
  const update = useUpdateMe()
  // A person who has not chosen a language reads the one the browser gave them: that is the one to show as chosen.
  const savedLocale = me.locale ?? appLocale
  const [name, setName] = useState(me.name)
  const [locale, setLocale] = useState<Locale>(savedLocale)
  const [problem, setProblem] = useState<TextProblem | null>(null)
  const nameChanged = name.trim() !== me.name
  const changed = nameChanged || locale !== savedLocale

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (update.isPending || !changed) return
    const found = textProblem(name, contractLimits.personName)
    setProblem(found)
    if (found !== null) return
    update.mutate({ ...(nameChanged ? { name: name.trim() } : {}), ...(locale === savedLocale ? {} : { locale }) })
  }

  return (
    <section className={styles.panel} aria-labelledby="settings-profile-heading">
      <div>
        <h2 id="settings-profile-heading" className={styles.heading}>
          {intl.formatMessage({ id: 'settings.profile.title' })}
        </h2>
        <p className={styles.description}>{intl.formatMessage({ id: 'settings.profile.description' })}</p>
      </div>
      <form className={styles.form} onSubmit={save} noValidate>
        <Input
          label={intl.formatMessage({ id: 'settings.profile.name.label' })}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={
            problem === null
              ? undefined
              : intl.formatMessage({ id: `settings.profile.name.${problem}` }, { max: contractLimits.personName.max })
          }
        />
        <Input label={intl.formatMessage({ id: 'settings.profile.email.label' })} value={me.email} readOnly />
        <ChoiceGroup
          legend={intl.formatMessage({ id: 'settings.profile.language.legend' })}
          name="language"
          value={locale}
          busy={update.isPending}
          onChange={setLocale}
          options={locales.map((option) => ({
            value: option,
            label: <span lang={option}>{localeNames[option]}</span>,
          }))}
        />
        <Button type="submit" loading={update.isPending} aria-disabled={!changed || undefined}>
          {intl.formatMessage({ id: 'settings.save' })}
        </Button>
        <FormStatus saved={update.isSuccess && !changed ? 'settings.saved' : null} failure={update.error} />
      </form>
    </section>
  )
}
