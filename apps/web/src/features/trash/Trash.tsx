import type { Schema } from '@draftroom/contract'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { documentListQuery } from '../documents/queries.ts'
import { DeleteDocumentDialog } from './DeleteDocumentDialog.tsx'
import { isGone } from './gone.ts'
import { TrashRow } from './TrashRow.tsx'
import { TrashSkeleton } from './TrashSkeleton.tsx'
import { useRestoreDocument } from './useRestoreDocument.ts'
import { useTrashFocus } from './useTrashFocus.ts'
import styles from './Trash.module.css'

/**
 * The archived documents of a workspace, a page at a time, with the two things an owner can do to each: loading, empty,
 * the list with "Load more", and a failure that can be retried. What each action did is said in a live region, and what
 * could not be done in an alert.
 */
export function Trash({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const query = useInfiniteQuery(documentListQuery(dataSource, workspaceId, { archived: true }))
  const documents = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const ids = useMemo(() => documents.map((document) => document.id), [documents])
  const list = useRef<HTMLUListElement>(null)
  const focus = useTrashFocus(list, ids)
  const restore = useRestoreDocument()
  const [deleting, setDeleting] = useState<Schema<'Document'> | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const done = (document: Schema<'Document'>, message: 'trash.restore.announcement' | 'trash.delete.announcement') => {
    focus.leaving(document.id)
    setProblem(null)
    setAnnouncement(intl.formatMessage({ id: message }, { title: document.title }))
  }
  const gone = (document: Schema<'Document'>) => {
    focus.leaving(document.id)
    setAnnouncement('')
    setProblem(intl.formatMessage({ id: 'trash.gone' }, { title: document.title }))
    setDeleting(null)
  }

  const restoreDocument = (document: Schema<'Document'>) => {
    setProblem(null)
    restore.mutate(document, {
      onSuccess: () => done(document, 'trash.restore.announcement'),
      onError: (error) =>
        isGone(error) ? gone(document) : setProblem(intl.formatMessage({ id: problemMessageId(error) })),
    })
  }

  if (query.isPending) return <TrashSkeleton />
  if (query.isError) return <QueryFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />

  return (
    <>
      {problem !== null && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      {documents.length === 0 ? (
        <StateMessage
          title={intl.formatMessage({ id: 'trash.empty.title' })}
          description={intl.formatMessage({ id: 'trash.empty.description' })}
        />
      ) : (
        <ul ref={list} className={styles.list}>
          {documents.map((document) => (
            <li key={document.id}>
              <TrashRow
                document={document}
                restoring={restore.isPending && restore.variables.id === document.id}
                onRestore={restoreDocument}
                onDelete={setDeleting}
              />
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => {
            focus.loadingMore()
            void query.fetchNextPage()
          }}
        >
          {intl.formatMessage({ id: 'documents.loadMore' })}
        </Button>
      )}
      <DeleteDocumentDialog
        document={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(document) => {
          setDeleting(null)
          done(document, 'trash.delete.announcement')
        }}
        onGone={gone}
      />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </>
  )
}
