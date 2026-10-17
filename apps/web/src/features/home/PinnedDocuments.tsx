import type { Schema } from '@draftroom/contract'
import type { UseQueryResult } from '@tanstack/react-query'
import { Button, IconButton } from '@yelison/forma-ui'
import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../components/DocumentRow/DocumentRow.tsx'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'
import { usePinDocument } from '../documents/actions/usePinDocument.ts'
import { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { StateMessage } from '../documents/StateMessage.tsx'
import layout from '../documents/ListLayout.module.css'
import { PinnedLoading } from './PinnedLoading.tsx'
import { PinnedSection } from './PinnedSection.tsx'
import styles from './Home.module.css'

type Document = Schema<'Document'>

export interface PinnedDocumentsProps {
  workspaceId: string
  pinned: UseQueryResult<Schema<'DocumentList'>>
}

/**
 * The documents the person pinned: loading, none yet (with the way to a first document), the cards, and a failure that
 * can be retried. Taking a pin off removes the card, so the focus goes to the card that takes its place.
 */
export function PinnedDocuments({ workspaceId, pinned }: PinnedDocumentsProps) {
  const intl = useIntl()
  const unpin = usePinDocument()
  const create = useCreateDocument(workspaceId)
  const list = useRef<HTMLUListElement>(null)
  const createButton = useRef<HTMLButtonElement>(null)
  // The card that gets the focus when the one that was unpinned is gone: the next one, the one before, or the button of the empty state.
  const [focusNext, setFocusNext] = useState<string | 'create' | null>(null)
  const [unpinnedTitle, setUnpinnedTitle] = useState<string | null>(null)
  // A live region says what is put into it after it is in the page, so it is first rendered empty.
  const announcement = useDeferredValue(
    unpinnedTitle === null ? '' : intl.formatMessage({ id: 'home.pinned.unpinned' }, { title: unpinnedTitle }),
    '',
  )

  const documents = pinned.data?.items
  const ids = documents?.map((document) => document.id).join()
  useEffect(() => {
    if (focusNext === null) return
    const target =
      focusNext === 'create'
        ? createButton.current
        : list.current?.querySelector<HTMLElement>(`[data-document="${focusNext}"] button`)
    // The button of the empty state is not there until the list says so: the focus waits for it.
    if (target === null || target === undefined) return
    target.focus()
    setFocusNext(null)
  }, [focusNext, ids])

  if (pinned.isPending) return <PinnedLoading />
  if (pinned.isError) {
    return (
      <PinnedSection>
        <StateMessage
          role="alert"
          title={intl.formatMessage({ id: 'home.pinned.error.title' })}
          description={intl.formatMessage({ id: 'home.pinned.error.description' })}
        >
          <Button loading={pinned.isFetching} onClick={() => void pinned.refetch()}>
            {intl.formatMessage({ id: 'home.pinned.error.retry' })}
          </Button>
        </StateMessage>
      </PinnedSection>
    )
  }

  const items = pinned.data.items
  const takeOff = (document: Document) => {
    if (unpin.isPending) return
    const index = items.findIndex((item) => item.id === document.id)
    const neighbour = items[index + 1] ?? items[index - 1]
    unpin.mutate(document, {
      onSuccess: () => {
        setUnpinnedTitle(document.title)
        setFocusNext(neighbour?.id ?? 'create')
      },
    })
  }

  return (
    <PinnedSection>
      {unpin.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(unpin.error) })}
        </p>
      )}
      {items.length === 0 ? (
        <StateMessage
          title={intl.formatMessage({ id: 'home.pinned.empty.title' })}
          description={intl.formatMessage({ id: 'home.pinned.empty.description' })}
        >
          <Button
            ref={createButton}
            loading={create.isPending}
            onClick={() => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })}
          >
            {intl.formatMessage({ id: 'documents.new' })}
          </Button>
        </StateMessage>
      ) : (
        <ul ref={list} className={layout.grid}>
          {items.map((document) => (
            <li key={document.id} data-document={document.id}>
              <DocumentRow
                card
                className={styles.card}
                title={<DocumentRowLink to={`/documents/${document.id}`}>{document.title}</DocumentRowLink>}
                meta={
                  <span className={styles.excerpt}>
                    {document.excerpt ?? intl.formatMessage({ id: 'home.pinned.noExcerpt' })}
                  </span>
                }
                trailing={
                  <IconButton
                    icon="star"
                    label={intl.formatMessage({ id: 'home.pinned.unpin' }, { title: document.title })}
                    onClick={() => takeOff(document)}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </PinnedSection>
  )
}
