import type { Schema } from '@draftroom/contract'
import { Avatar } from '@yelison/forma-ui'
import { presenceLookOf } from '../../collab/presenceColor.ts'

// The name an automatic change is credited to: its initials are all the avatar shows, and the sentence names nobody.
const serverName = 'Draftroom'

/** The avatar of whoever made a change, which is the server itself for the changes it makes on its own. */
export function ActorAvatar({ actor }: { actor: Schema<'ActivityEvent'>['actor'] }) {
  return (
    <Avatar
      decorative
      size="small"
      name={actor?.name ?? serverName}
      tone={actor === null ? 'neutral' : presenceLookOf(actor.id).tone}
    />
  )
}
