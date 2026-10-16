import { useQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { Link, useParams } from 'react-router'
import { isApiError } from '../../data/errors.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentEditor } from './DocumentEditor.tsx'
import { EditorSkeleton } from './EditorSkeleton.tsx'
import { EditorStatePanel } from './EditorStatePanel.tsx'
import { documentQuery } from './documentQuery.ts'
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
  // read: the server never says which, and neither does this screen.
  const notFound = query.isError && isApiError(query.error, 'not-found')
  // A retry puts the query back to pending: the screen stays on its message until the answer comes, so the button that was
  // pressed is still there, with the focus on it, instead of giving way to the skeleton.
  const retrying = query.isPending && query.isFetching && query.errorUpdateCount > 0
  const failed = (query.isError && !notFound) || retrying

  // The button that was pressed to try again is gone once the document is there: the focus goes to the headline, as it
  // does when a page opens, instead of falling to the page.
  const recovered = query.isSuccess && query.errorUpdateCount > 0
  const headline = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (recovered) headline.current?.focus()
  }, [recovered])

  const heading = notFound
    ? intl.formatMessage({ id: 'editor.state.notFound.title' })
    : failed
      ? intl.formatMessage({ id: 'editor.state.error.title' })
      : (query.data?.title ?? intl.formatMessage({ id: 'screen.document' }))

  return (
    <>
      <title>{intl.formatMessage({ id: 'app.documentTitle' }, { page: heading })}</title>
      <h1 ref={headline} tabIndex={-1} className={notFound || failed ? styles.stateHeading : 'forma-visually-hidden'}>
        {heading}
      </h1>
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
      {query.isPending && !retrying && <EditorSkeleton />}
      {query.isSuccess && (
        <DocumentEditor key={query.data.id} document={query.data} focusHeadline={() => headline.current?.focus()} />
      )}
    </>
  )
}
