import type { Schema } from '@draftroom/contract'
import { useIntl } from 'react-intl'

/**
 * What an event says, as one sentence of the catalogue per kind of event: the words around the people and the document
 * differ by language, so none of it is put together here. An event of the server (a version saved on its own) has nobody
 * to name.
 */
export function useEventSentence() {
  const intl = useIntl()

  return (event: Schema<'ActivityEvent'>): string => {
    const title = event.document.title
    if (event.actor === null) return intl.formatMessage({ id: 'history.event.automatic' }, { title })
    return intl.formatMessage(
      { id: `history.event.${event.type}` },
      {
        actor: event.actor.name,
        target: event.targetUser?.name ?? intl.formatMessage({ id: 'history.event.someone' }),
        title,
      },
    )
  }
}
