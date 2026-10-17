import { useQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useCallback, useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentEditor } from './DocumentEditor.tsx'
import { EditorSkeleton } from './EditorSkeleton.tsx'
import { EditorStatePanel } from './EditorStatePanel.tsx'
import { documentQuery } from './documentQuery.ts'
import { usePurgeUnavailableCopy } from './usePurgeUnavailableCopy.ts'
import styles from './EditorScreen.module.css'

/**
 * The screen of `/documents/:documentId`: the document, or the reason there is none.
 *
 * The headline is one element in every state, so the focus that navigation puts on it (`useFocusOnNavigation`) stays on
 * it when the document arrives. It is the document's title for a reader of the page, and visible only where it is also
 * the message of the screen.
 */
export function EditorScreen() {
  const intl = useIntl()
  const { documentId } = useParams()
  if (documentId === undefined) throw new Error('The route of the editor has no :documentId')
  const dataSource = useDataSource()
  const query = useQuery(documentQuery(dataSource, documentId))

  // An answer of the contract that says "not found" is the same for a document that is gone and one the person cannot
  // read: the server never says which, and neither does this screen. A `403` is not in this: here it is for someone who can
  // read the document and may not do something with it, so it never says that the person lost it.
  const notFoundAnswer = query.isError && isApiError(query.error, 'not-found')
  // The same answer to a document that was open is not a screen of its own: the person has the document, its session and
  // the copy of this device in front of them, and it is the session that purges the copy and says that access was removed.
  // Taking the editor out for a message here would end the session before it could.
  const accessRemoved = notFoundAnswer && query.data !== undefined
  const noAnswerToShow = notFoundAnswer && query.data === undefined
  // Opened with the page closed: nothing was ever shown, so what this device kept is purged here, and what it held says
  // whether the person lost the document (a copy was there, as in the open document) or never had it (protocol section 12.4).
  const keptCopy = usePurgeUnavailableCopy(documentId, noAnswerToShow)
  const checkingCopy = noAnswerToShow && keptCopy === undefined
  const removedWhileClosed = keptCopy?.hadCopy === true
  const notFound = keptCopy?.hadCopy === false
  // A retry puts the query back to pending: the screen stays on its message until the answer comes, so the button that was
  // pressed is still there, with the focus on it, instead of giving way to the skeleton.
  const retrying = query.isPending && query.isFetching && query.errorUpdateCount > 0
  const failed = (query.isError && !notFoundAnswer) || retrying

  // The button that was pressed to try again is gone once the document is there: the focus goes to the headline, as it
  // does when a page opens, instead of falling to the page.
  const recovered = query.isSuccess && query.errorUpdateCount > 0
  const headline = useRef<HTMLHeadingElement>(null)
  // The same function every render: an effect that depends on it must not run again just because the screen rendered.
  const focusHeadline = useCallback(() => headline.current?.focus(), [])
  useEffect(() => {
    if (recovered) headline.current?.focus()
  }, [recovered])

  const opened = query.isSuccess || accessRemoved ? query.data : undefined

  const heading = removedWhileClosed
    ? intl.formatMessage({ id: 'sync.revoked.title' })
    : notFound
      ? intl.formatMessage({ id: 'editor.state.notFound.title' })
      : failed
        ? intl.formatMessage({ id: 'editor.state.error.title' })
        : (query.data?.title ?? intl.formatMessage({ id: 'screen.document' }))

  return (
    <>
      <title>{intl.formatMessage({ id: 'app.documentTitle' }, { page: heading })}</title>
      <h1
        ref={headline}
        tabIndex={-1}
        className={removedWhileClosed || notFound || failed ? styles.stateHeading : 'forma-visually-hidden'}
      >
        {heading}
      </h1>
      {removedWhileClosed && (
        <EditorStatePanel
          {...(keptCopy.hadUnstoredChanges
            ? { description: intl.formatMessage({ id: 'sync.revoked.description' }) }
            : {})}
        >
          <Link to="/documents" className={buttonClassName()}>
            {intl.formatMessage({ id: 'sync.revoked.action' })}
          </Link>
        </EditorStatePanel>
      )}
      {notFound && (
        <EditorStatePanel description={intl.formatMessage({ id: 'editor.state.notFound.description' })}>
          <Link to="/documents" className={buttonClassName()}>
            {intl.formatMessage({ id: 'editor.state.notFound.action' })}
          </Link>
        </EditorStatePanel>
      )}
      {failed && (
        <EditorStatePanel description={intl.formatMessage({ id: 'editor.state.error.description' })}>
          <Button loading={query.isFetching} onClick={() => void query.refetch()}>
            {intl.formatMessage({ id: 'editor.state.error.retry' })}
          </Button>
        </EditorStatePanel>
      )}
      {((query.isPending && !retrying) || checkingCopy) && <EditorSkeleton />}
      {opened !== undefined && (
        <DocumentEditor key={opened.id} document={opened} accessRemoved={accessRemoved} focusHeadline={focusHeadline} />
      )}
    </>
  )
}
