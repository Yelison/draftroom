import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, IconButton, SearchField, Tooltip } from '@yelison/forma-ui'
import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useNavigate, useParams } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentActionDialogs } from '../documents/actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from '../documents/actions/useActionDialogs.ts'
import { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { problemMessageId } from '../documents/problemMessage.ts'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { documentListQuery, foldersQuery } from '../documents/queries.ts'
import { searchTerm } from '../documents/searchTerm.ts'
import { ExplorerSkeleton } from './ExplorerSkeleton.tsx'
import { ExplorerTree, type ExplorerTreeHandle } from './tree/ExplorerTree.tsx'
import { buildTree, type TreeItem } from './tree/treeModel.ts'
import styles from './Explorer.module.css'

/** The documents of a page the explorer asks for: it lists them all, so it asks for as many as the contract allows. */
const pageSize = 100

/**
 * The column beside a document: search, the recent documents, the folders with theirs and the documents that are in none.
 * The row of the open document is the selected one.
 */
export function Explorer() {
  const intl = useIntl()

  return (
    <aside aria-label={intl.formatMessage({ id: 'explorer.label' })} className={styles.explorer}>
      <WorkspaceGate loading={<ExplorerSkeleton />}>
        {(workspaceId) => <Content workspaceId={workspaceId} />}
      </WorkspaceGate>
    </aside>
  )
}

function Content({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const navigate = useNavigate()
  // The layout above the screens sees the parameters of the route below it, so this is the open document.
  const { documentId: openDocumentId } = useParams()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const term = searchTerm(deferredSearch)
  const tree = useRef<ExplorerTreeHandle>(null)
  const actions = useActionDialogs(() => tree.current?.focusTabStop())
  const create = useCreateDocument(workspaceId)
  const [announcement, setAnnouncement] = useState('')

  const folders = useQuery(foldersQuery(dataSource, workspaceId))
  const documents = useInfiniteQuery({
    ...documentListQuery(dataSource, workspaceId, { limit: pageSize, ...(term === undefined ? {} : { query: term }) }),
    placeholderData: keepPreviousData,
  })
  const documentItems = useMemo(() => documents.data?.pages.flatMap((page) => page.items) ?? [], [documents.data])
  const roots = useMemo(
    () =>
      buildTree({
        folders: folders.data?.items ?? [],
        documents: documentItems,
        searching: term !== undefined,
        recentLabel: intl.formatMessage({ id: 'explorer.recent' }),
      }),
    [folders.data, documentItems, term, intl],
  )

  const change = (item: TreeItem) => {
    if (item.kind === 'folder') actions.open({ kind: 'rename-folder', folder: item.folder })
    if (item.kind === 'document' && item.document.role !== 'viewer' && item.document.role !== 'commenter') {
      actions.open({ kind: 'details', document: item.document })
    }
  }
  const archive = (item: TreeItem) => {
    if (item.kind === 'document') actions.open({ kind: 'archive', document: item.document })
  }

  const retry = () => void Promise.all([folders.refetch(), documents.refetch()])
  const failed = folders.isError || documents.isError
  const loading = folders.isPending || documents.isPending
  const empty = !loading && !failed && roots.length === 0

  return (
    <div className={styles.content}>
      <div className={styles.header}>
        <SearchField
          label={intl.formatMessage({ id: 'documents.search.label' })}
          placeholder={intl.formatMessage({ id: 'documents.search.label' })}
          value={search}
          onValueChange={setSearch}
        />
        <div className={styles.actions}>
          <Button
            icon="plus"
            loading={create.isPending}
            onClick={() => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })}
          >
            {intl.formatMessage({ id: 'documents.new' })}
          </Button>
          <Tooltip content={intl.formatMessage({ id: 'documents.newFolder' })} placement="bottom-end" describe={false}>
            {(trigger) => (
              <IconButton
                {...trigger}
                icon="folder"
                label={intl.formatMessage({ id: 'documents.newFolder' })}
                onClick={() => actions.open({ kind: 'create-folder', workspaceId })}
              />
            )}
          </Tooltip>
        </div>
        {create.isError && (
          <p role="alert" className={styles.problem}>
            {intl.formatMessage({ id: problemMessageId(create.error) })}
          </p>
        )}
      </div>
      <div className={styles.body}>
        {loading && <ExplorerSkeleton />}
        {failed && <QueryFailure onRetry={retry} retrying={folders.isFetching || documents.isFetching} />}
        {empty &&
          (term === undefined ? (
            <StateMessage
              title={intl.formatMessage({ id: 'documents.empty.title' })}
              description={intl.formatMessage({ id: 'documents.empty.description' })}
            />
          ) : (
            <StateMessage
              title={intl.formatMessage({ id: 'documents.noResults.title' }, { query: term })}
              description={intl.formatMessage({ id: 'documents.noResults.description' })}
            />
          ))}
        {roots.length > 0 && (
          <ExplorerTree
            ref={tree}
            label={intl.formatMessage({ id: term === undefined ? 'explorer.tree' : 'explorer.results' })}
            roots={roots}
            openDocumentId={openDocumentId}
            onOpenDocument={(documentId) => void navigate(`/documents/${documentId}`)}
            onChange={change}
            onArchive={archive}
          />
        )}
        {documents.hasNextPage && (
          <Button variant="ghost" loading={documents.isFetchingNextPage} onClick={() => void documents.fetchNextPage()}>
            {intl.formatMessage({ id: 'documents.loadMore' })}
          </Button>
        )}
      </div>
      <DocumentActionDialogs
        actions={actions}
        onArchived={(document) =>
          setAnnouncement(intl.formatMessage({ id: 'documents.archive.announcement' }, { title: document.title }))
        }
      />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </div>
  )
}
