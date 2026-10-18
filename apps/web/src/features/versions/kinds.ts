import type { Schema } from '@draftroom/contract'
import type { MessageId } from '../../i18n/messages.ts'

/** What each kind of version is called. A kind the contract adds is a compile error here until it has a name. */
export const kindMessageId = {
  auto: 'versions.kind.auto',
  manual: 'versions.kind.manual',
  'pre-restore': 'versions.kind.preRestore',
  restore: 'versions.kind.restore',
} as const satisfies Record<Schema<'VersionKind'>, MessageId>

/** The word the messages choose a kind by: a selector of ICU cannot hold the hyphen of `pre-restore`. */
export const kindSelector = {
  auto: 'auto',
  manual: 'manual',
  'pre-restore': 'preRestore',
  restore: 'restore',
} as const satisfies Record<Schema<'VersionKind'>, string>
