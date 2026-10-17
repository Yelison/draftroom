import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'
import { kindMessageId } from './kinds.ts'

/** When a version was made, in the person's language: a date and a time, which is what tells two of the same day apart. */
export function useVersionDate() {
  const intl = useIntl()
  return (version: Pick<Schema<'Version'>, 'createdAt'>) =>
    intl.formatDate(version.createdAt, { dateStyle: 'medium', timeStyle: 'short' })
}

/** What a version is called: the name it was given, or, when it has none, what kind it is and when it was made. */
export function useVersionName() {
  const intl = useIntl()
  const dateOf = useVersionDate()
  return (version: Schema<'Version'>) =>
    version.label ??
    intl.formatMessage(
      { id: 'versions.unnamed' },
      { kind: intl.formatMessage({ id: kindMessageId[version.kind] }), date: dateOf(version) },
    )
}
