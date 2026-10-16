import type { Schema } from '@draftroom/contract'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { useEventSentence } from './useEventSentence.ts'
import styles from './EventPanel.module.css'

export interface EventPanelProps {
  id: string
  /** The event that was opened, or nothing when it has left the history since: its document is no longer one the person can read. */
  event: Schema<'ActivityEvent'> | undefined
  onClose: () => void
}

/**
 * What one event of the history says, beside the list. It takes the focus when it opens, on its heading, and the screen
 * gives the focus back to the row when it closes. Open it with a `key` per event, so each one is announced from its heading.
 */
export function EventPanel({ id, event, onClose }: EventPanelProps) {
  const intl = useIntl()
  const sentence = useEventSentence()
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    heading.current?.focus()
  }, [])

  return (
    <aside id={id} aria-labelledby={`${id}-heading`} className={styles.panel}>
      <div className={styles.header}>
        <h2 id={`${id}-heading`} ref={heading} tabIndex={-1} className={styles.title}>
          {intl.formatMessage({ id: 'history.panel.title' })}
        </h2>
        <Button variant="ghost" size="compact" onClick={onClose}>
          {intl.formatMessage({ id: 'history.panel.close' })}
        </Button>
      </div>
      {event === undefined ? (
        <div role="alert" className={styles.gone}>
          <p className={styles.goneTitle}>{intl.formatMessage({ id: 'history.panel.gone.title' })}</p>
          <p className={styles.goneDescription}>{intl.formatMessage({ id: 'history.panel.gone.description' })}</p>
        </div>
      ) : (
        <>
          <p className={styles.sentence}>{sentence(event)}</p>
          <dl className={styles.facts}>
            <dt>{intl.formatMessage({ id: 'history.panel.when' })}</dt>
            <dd>{intl.formatDate(event.createdAt, { dateStyle: 'full', timeStyle: 'short' })}</dd>
            {event.actor !== null && (
              <>
                <dt>{intl.formatMessage({ id: 'history.panel.by' })}</dt>
                <dd>{event.actor.name}</dd>
              </>
            )}
            {event.targetUser !== null && (
              <>
                <dt>{intl.formatMessage({ id: 'history.panel.about' })}</dt>
                <dd>{event.targetUser.name}</dd>
              </>
            )}
            <dt>{intl.formatMessage({ id: 'history.panel.document' })}</dt>
            <dd className={styles.documentTitle}>{event.document.title}</dd>
          </dl>
          <Link to={`/documents/${event.document.id}`} className={buttonClassName({ variant: 'secondary' })}>
            {intl.formatMessage({ id: 'history.panel.open' })}
          </Link>
        </>
      )}
    </aside>
  )
}
