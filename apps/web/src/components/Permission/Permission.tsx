import type { Schema } from '@draftroom/contract'
import { Badge, type BadgeTone } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'

type DocumentRole = Schema<'DocumentRole'>

const tones: Record<DocumentRole, BadgeTone> = {
  viewer: 'neutral',
  commenter: 'blue',
  editor: 'green',
  owner: 'purple',
}

/** The message that names a role. It is the same everywhere a role is named: the badge, the role pickers, the announcements. */
export const permissionLabelId = (role: DocumentRole): MessageId => `permission.${role}`

/**
 * The role a person has in a document, as a badge. The colour only helps: the name of the role is the text, so it does
 * not depend on seeing the colour.
 */
export function Permission({ role }: { role: DocumentRole }) {
  const intl = useIntl()

  return (
    <Badge tone={tones[role]} data-role={role}>
      {intl.formatMessage({ id: permissionLabelId(role) })}
    </Badge>
  )
}
