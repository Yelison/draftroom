import type { Schema } from '@draftroom/contract'
import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'

type ActivityEvent = Schema<'ActivityEvent'>

/** How the person and the document of an event are written into its sentence: as words, or as whatever the screen makes of them. */
interface Parts<Value> {
  actor: (name: string) => Value
  title: (document: ActivityEvent['document']) => Value
}

/**
 * The sentence of the catalogue for one kind of event, and what goes into it: the words around the people and the
 * document differ by language, so none of it is put together here. An event of the server (a version saved on its own)
 * has nobody to name.
 */
function sentenceOf<Value>(event: ActivityEvent, parts: Parts<Value>, someone: string) {
  const title = parts.title(event.document)
  if (event.actor === null) return { id: 'history.event.automatic', values: { title } }
  return {
    id: `history.event.${event.type}`,
    values: { actor: parts.actor(event.actor.name), target: event.targetUser?.name ?? someone, title },
  }
}

/** What an event says, as text. */
export function useEventSentence() {
  const intl = useIntl()
  const someone = intl.formatMessage({ id: 'history.event.someone' })

  return (event: ActivityEvent): string => {
    const { id, values } = sentenceOf(event, { actor: (name) => name, title: ({ title }) => title }, someone)
    return intl.formatMessage({ id }, values)
  }
}

/**
 * What an event says, with the person in strong type and the document written by `title`, which is how the timeline
 * makes the name of the document the way to it.
 */
export function useRichEventSentence() {
  const intl = useIntl()
  const someone = intl.formatMessage({ id: 'history.event.someone' })

  return (event: ActivityEvent, title: (document: ActivityEvent['document']) => ReactNode): ReactNode => {
    const { id, values } = sentenceOf(event, { actor: (name) => <strong>{name}</strong>, title }, someone)
    return intl.formatMessage({ id }, values)
  }
}
