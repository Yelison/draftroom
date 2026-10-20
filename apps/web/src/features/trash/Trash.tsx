import type { Schema } from '@draftroom/contract'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button } from '@yelison/forma-ui'
import { useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { documentListQuery, foldersQuery } from '../documents/queries.ts'
import { DeleteDocumentDialog } from './DeleteDocumentDialog.tsx'
import { isGone } from './gone.ts'
import { TrashDetail } from './TrashDetail.tsx'
import { TrashList } from './TrashList.tsx'
import { TrashSkeleton } from './TrashSkeleton.tsx'
import { useRestoreDocument } from './useRestoreDocument.ts'
import { useTrashFocus } from './useTrashFocus.ts'
import { useTrashSelection } from './useTrashSelection.ts'
import styles from './Trash.module.css'

/** What the last restore of a document could not do, said in the panel of that document and nowhere else. */
interface Problem {
  documentId: string
  message: string
}

/**
 * The archived documents of a workspace, a page at a time, with the selected one beside them and the two things an owner
 * can do to it: loading, empty, the list with "Load more", and a failure that can be retried. What each action did is
 * said in a live region, and what could not be done in an alert.
 */
export function Trash({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const documentsQuery = useInfiniteQuery(documentListQuery(dataSource, workspaceId, { archived: true }))
  const folders = useQuery(foldersQuery(dataSource, workspaceId))
  const documents = useMemo(() => documentsQuery.data?.pages.flatMap((page) => page.items) ?? [], [documentsQuery.data])
  const ids = useMemo(() => documents.map((document) => document.id), [documents])
  const folderNames = useMemo(
    () => new Map(folders.data?.items.map((folder) => [folder.id, folder.name])),
    [folders.data],
  )
  const list = useRef<HTMLUListElement>(null)
  const selection = useTrashSelection(ids)
  const focus = useTrashFocus(list, ids, selection.selectedIndex, workspaceId)
  const [deleting, setDeleting] = useState<Schema<'Document'> | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [problem, setProblem] = useState<Problem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const done = (document: Schema<'Document'>, message: 'trash.restore.announcement' | 'trash.delete.announcement') => {
    focus.leaving(document.id)
    setProblem(null)
    setNotice(null)
    setAnnouncement(intl.formatMessage({ id: message }, { title: document.title }))
  }
  const gone = (document: Schema<'Document'>) => {
    focus.leaving(document.id)
    setAnnouncement('')
    setProblem(null)
    setNotice(intl.formatMessage({ id: 'trash.gone' }, { title: document.title }))
    setDeleting(null)
  }
  const { restore, restoring } = useRestoreDocument({
    onRestored: (document) => done(document, 'trash.restore.announcement'),
    onFailed: (document, error) =>
      isGone(error)
        ? gone(document)
        : setProblem({ documentId: document.id, message: intl.formatMessage({ id: problemMessageId(error) }) }),
  })

  const restoreDocument = (document: Schema<'Document'>) => {
    setProblem(null)
    restore(document)
  }

  const folderNameOf = (document: Schema<'Document'>) =>
    document.folderId === null ? null : (folderNames.get(document.folderId) ?? null)

  // The screen as a whole fails only when there is nothing to show: a page of the list that cannot be read, or a list
  // that cannot be read again, leaves what was read on screen.
  if (documentsQuery.isPending || folders.isPending) return <TrashSkeleton />
  if (documentsQuery.data === undefined || folders.data === undefined) {
    return (
      <QueryFailure
        onRetry={() => {
          if (documentsQuery.data === undefined) void documentsQuery.refetch()
          if (folders.data === undefined) void folders.refetch()
        }}
        retrying={documentsQuery.isFetching || folders.isFetching}
      />
    )
  }

  const selected = documents[selection.selectedIndex]
  const select = (document: Schema<'Document'>) => {
    setNotice(null)
    selection.select(document.id)
  }

  return (
    <div className={styles.trash}>
      {selected === undefined ? (
        <>
          {notice !== null && (
            <p role="alert" className={styles.problem}>
              {notice}
            </p>
          )}
          <StateMessage
            title={intl.formatMessage({ id: 'trash.empty.title' })}
            description={intl.formatMessage({ id: 'trash.empty.description' })}
          />
        </>
      ) : (
        <div className={styles.layout}>
          <div className={styles.listColumn}>
            <TrashList
              ref={list}
              documents={documents}
              folderNameOf={folderNameOf}
              selectedIndex={selection.selectedIndex}
              onSelect={select}
            />
            {documentsQuery.isFetchNextPageError && (
              <p role="alert" className={styles.problem}>
                {intl.formatMessage({ id: 'trash.loadMore.error' })}
              </p>
            )}
            {documentsQuery.hasNextPage && (
              <Button
                variant="secondary"
                loading={documentsQuery.isFetchingNextPage}
                onClick={() => {
                  focus.loadingMore()
                  void documentsQuery.fetchNextPage()
                }}
              >
                {intl.formatMessage({
                  id: documentsQuery.isFetchNextPageError ? 'documents.error.retry' : 'documents.loadMore',
                })}
              </Button>
            )}
          </div>
          <TrashDetail
            document={selected}
            folderName={folderNameOf(selected)}
            notice={notice}
            restoring={restoring.has(selected.id)}
            problem={problem?.documentId === selected.id ? problem.message : null}
            onRestore={restoreDocument}
            onDelete={setDeleting}
          />
        </div>
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
    </div>
  )
}
