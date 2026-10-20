import { useQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useDeferredValue, useState, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { Link, useParams } from 'react-router'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { focusMainContent } from '../../app/mainContent.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { DocumentActionDialogs } from './actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from './actions/useActionDialogs.ts'
import { useCreateDocument } from './actions/useCreateDocument.ts'
import { DocumentCollection } from './DocumentCollection.tsx'
import { DocumentsSkeleton } from './ListSkeleton.tsx'
import { ListToolbar } from './ListToolbar.tsx'
import { NoWorkspace } from './NoWorkspace.tsx'
import { QueryFailure } from './QueryFailure.tsx'
import { StateMessage } from './StateMessage.tsx'
import { foldersQuery } from './queries.ts'
import { problemMessageId } from './problemMessage.ts'
import { searchTerm } from './searchTerm.ts'
import { useWorkspaceId } from './useWorkspaceId.ts'
import layout from './ListLayout.module.css'
import styles from './DocumentsScreen.module.css'

/**
 * The screen of `/folders/:folderId`: the documents of one folder. The contract has no operation for a single folder, so
 * the folder is found among the workspace's; one that is not there is the same "not available" whether it was deleted,
 * never existed or belongs to a workspace the person is not in.
 *
 * The headline is one element in every state, so the focus that navigation puts on it stays on it when the folder arrives.
 */
export function FolderScreen() {
  const intl = useIntl()
  const { folderId } = useParams()
  if (folderId === undefined) throw new Error('The route of a folder has no :folderId')
  const dataSource = useDataSource()
  const workspace = useWorkspaceId()
  const workspaceId = workspace.data
  const folders = useQuery({
    ...foldersQuery(dataSource, workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  })
  const folder = folders.data?.items.find((item) => item.id === folderId)

  const failed = workspace.isError || folders.isError
  const noWorkspace = workspace.isSuccess && workspaceId === undefined
  const notFound = folders.isSuccess && folder === undefined
  const heading =
    folder?.name ?? intl.formatMessage({ id: notFound ? 'documents.folderNotFound.title' : 'screen.folder' })

  let body: ReactNode
  if (failed) {
    body = (
      <QueryFailure
        retrying={workspace.isFetching || folders.isFetching}
        onRetry={() => void (workspace.isError ? workspace.refetch() : folders.refetch())}
      />
    )
  } else if (noWorkspace) {
    body = <NoWorkspace />
  } else if (notFound) {
    body = (
      <StateMessage description={intl.formatMessage({ id: 'documents.folderNotFound.description' })}>
        <Link to="/documents" className={buttonClassName()}>
          {intl.formatMessage({ id: 'documents.folderNotFound.action' })}
        </Link>
      </StateMessage>
    )
  } else if (folder === undefined || workspaceId === undefined) {
    body = <DocumentsSkeleton />
  } else {
    body = <FolderDocuments workspaceId={workspaceId} folderId={folder.id} />
  }

  return (
    <div className={layout.screen}>
      <PageTitle title={heading} />
      {body}
    </div>
  )
}

function FolderDocuments({ workspaceId, folderId }: { workspaceId: string; folderId: string }) {
  const intl = useIntl()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const term = searchTerm(deferredSearch)
  const create = useCreateDocument(workspaceId)
  const actions = useActionDialogs(focusMainContent)
  const [announcement, setAnnouncement] = useState('')

  const createDocument = () => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }), folderId })

  return (
    <>
      <ListToolbar search={search} onSearch={setSearch}>
        <Button loading={create.isPending} onClick={createDocument}>
          {intl.formatMessage({ id: 'documents.new' })}
        </Button>
      </ListToolbar>
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(create.error) })}
        </p>
      )}
      <DocumentCollection
        workspaceId={workspaceId}
        folderId={folderId}
        term={term}
        onActions={(document) => actions.open({ kind: 'details', document })}
        onArchive={(document) => actions.open({ kind: 'archive', document })}
        empty={
          <StateMessage
            title={intl.formatMessage({ id: 'documents.folderEmpty.title' })}
            description={intl.formatMessage({ id: 'documents.folderEmpty.description' })}
          >
            <Button loading={create.isPending} onClick={createDocument}>
              {intl.formatMessage({ id: 'documents.new' })}
            </Button>
          </StateMessage>
        }
      />
      <DocumentActionDialogs
        actions={actions}
        onArchived={(document) =>
          setAnnouncement(intl.formatMessage({ id: 'documents.archive.announcement' }, { title: document.title }))
        }
      />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </>
  )
}
