import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { kindMessageId } from './kinds.ts'

/** When a version was made, in the person's language: a date and a time, which is what tells two of the same day apart. */
export function useVersionDate() {
  const intl = useIntl()
  return (version: Pick<Schema<'Version'>, 'createdAt'>) =>
    intl.formatDate(version.createdAt, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * What names a version where its row is not in sight (the button that restores it, the dialog, what is announced): the
 * name it was given, or when it has none, what kind it is, and in both cases when it was made. Two versions may share a
 * name (a restore copies the one it went back to), and a name that tells them apart is what a person hears.
 */
export function useVersionName() {
  const intl = useIntl()
  const dateOf = useVersionDate()
  return (version: Schema<'Version'>) =>
    version.label === null
      ? intl.formatMessage(
          { id: 'versions.unnamed' },
          { kind: intl.formatMessage({ id: kindMessageId[version.kind] }), date: dateOf(version) },
        )
      : intl.formatMessage({ id: 'versions.named' }, { label: version.label, date: dateOf(version) })
}
