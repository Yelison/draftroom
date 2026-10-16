import type { AuthorizedScope } from '@draftroom/contract/collab'
import { can, verdictFor, type Subject } from '../domain/permissions.ts'

// What a person's connection may do, as a pure function of the facts `onAuthenticate` loaded (protocol §4). It reuses the
// rules REST uses, so the two doors cannot disagree: an archived document is readable only by its owners, and
// nobody writes to one.

export type ConnectionMode =
  /** The person may not know the document exists: the connection is refused as for a missing document. */
  { readonly access: 'refused' } | { readonly access: 'granted'; readonly scope: AuthorizedScope }

export function connectionModeFor(subject: Subject): ConnectionMode {
  if (verdictFor(subject, 'read', { onArchived: true }) !== 'allowed') return { access: 'refused' }
  const writes = !subject.archived && can(subject.role, 'write-content')
  return { access: 'granted', scope: writes ? 'read-write' : 'readonly' }
}
