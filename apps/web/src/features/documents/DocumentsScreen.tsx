import { useQuery } from '@tanstack/react-query'
import { Button, buttonClassName } from '@yelison/forma-ui'
import { useDeferredValue, useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import { Link, useLocation, useNavigate } from 'react-router'
import { TemplatePickerDialog } from '../templates/TemplatePickerDialog.tsx'
import { useSearchSubmit } from '../search/useSearchSubmit.ts'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { focusMainContent } from '../../app/mainContent.ts'
import { useDataSource } from '../../data/useDataSource.ts'
import { problemMessageId } from './problemMessage.ts'
import { DocumentActionDialogs } from './actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from './actions/useActionDialogs.ts'
import { useCreateDocument } from './actions/useCreateDocument.ts'
import { archivedTitleFrom } from './archivedNotice.ts'
import { DocumentCollection } from './DocumentCollection.tsx'
import { FolderCard } from './FolderCard.tsx'
import { DocumentsSkeleton } from './ListSkeleton.tsx'
import { ListToolbar } from './ListToolbar.tsx'
import { QueryFailure } from './QueryFailure.tsx'
import { StateMessage } from './StateMessage.tsx'
import { WorkspaceGate } from './WorkspaceGate.tsx'
import { foldersQuery } from './queries.ts'
import { searchTerm } from './searchTerm.ts'
import layout from './ListLayout.module.css'
import styles from './DocumentsScreen.module.css'

/**
 * The screen of `/documents`: the folders and the documents of the workspace, with a search over the documents. The
 * headline is outside everything that loads, so the focus that navigation puts on it has somewhere to stay.
 */
export function DocumentsScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.documents" />
      <WorkspaceGate loading={<DocumentsSkeleton />}>
        {(workspaceId) => <Documents workspaceId={workspaceId} />}
      </WorkspaceGate>
    </div>
  )
}

function Documents({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const [search, setSearch] = useState('')
  const [pickingTemplate, setPickingTemplate] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const submitSearch = useSearchSubmit(search)
  const term = searchTerm(deferredSearch)
  const folders = useQuery(foldersQuery(dataSource, workspaceId))
  const create = useCreateDocument(workspaceId)
  const actions = useActionDialogs(focusMainContent)
  // The notice of a document archived while open comes with the navigation. It is read once and taken out of the history
  // entry, so reloading the page or coming back to it does not announce it again.
  const location = useLocation()
  const [archivedTitle] = useState(() => archivedTitleFrom(location.state))
  const navigate = useNavigate()
  useEffect(() => {
    if (archivedTitle !== null) void navigate(location.pathname, { replace: true, state: null })
  }, [archivedTitle, location.pathname, navigate])
  const [archivedHere, setArchivedHere] = useState<string | null>(null)
  // A live region says what is put into it after it is in the page, so the text is first rendered empty: the deferred
  // value starts as '' and takes the message in the render that follows.
  const announcedTitle = archivedHere ?? archivedTitle
  const announcement = useDeferredValue(
    announcedTitle === null
      ? ''
      : intl.formatMessage({ id: 'documents.archive.announcement' }, { title: announcedTitle }),
    '',
  )

  // A workspace with no folder has no heading over nothing, and a search looks at documents only.
  const showFolders = term === undefined && !(folders.isSuccess && folders.data.items.length === 0)
  const createDocument = () => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })

  return (
    <>
      <ListToolbar search={search} onSearch={setSearch} onSearchKeyDown={submitSearch}>
        <Link to="/trash" className={buttonClassName({ variant: 'ghost' })}>
          {intl.formatMessage({ id: 'screen.trash' })}
        </Link>
        <Button variant="secondary" onClick={() => actions.open({ kind: 'create-folder', workspaceId })}>
          {intl.formatMessage({ id: 'documents.newFolder' })}
        </Button>
        <Button variant="secondary" onClick={() => setPickingTemplate(true)}>
          {intl.formatMessage({ id: 'templates.pick' })}
        </Button>
        <Button loading={create.isPending} onClick={createDocument}>
          {intl.formatMessage({ id: 'documents.new' })}
        </Button>
      </ListToolbar>
      <TemplatePickerDialog open={pickingTemplate} onClose={() => setPickingTemplate(false)} />
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(create.error) })}
        </p>
      )}
      {/* Folders first, then documents: the page is not shown until the folders are in, or the documents would move down when they arrive. */}
      {folders.isPending && <DocumentsSkeleton />}
      {showFolders && !folders.isPending && (
        <section aria-labelledby="documents-folders">
          <h2 id="documents-folders" className={styles.group}>
            {intl.formatMessage({ id: 'documents.folders' })}
          </h2>
          {folders.isError && <QueryFailure onRetry={() => void folders.refetch()} retrying={folders.isFetching} />}
          {folders.isSuccess && folders.data.items.length > 0 && (
            <ul className={layout.grid}>
              {folders.data.items.map((folder) => (
                <li key={folder.id}>
                  <FolderCard
                    folder={folder}
                    onRename={(target) => actions.open({ kind: 'rename-folder', folder: target })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {!folders.isPending && (
        <section aria-labelledby="documents-all">
          <h2 id="documents-all" className={styles.group}>
            {intl.formatMessage({ id: 'documents.all' })}
          </h2>
          <DocumentCollection
            workspaceId={workspaceId}
            term={term}
            onActions={(document) => actions.open({ kind: 'details', document })}
            empty={
              <StateMessage
                title={intl.formatMessage({ id: 'documents.empty.title' })}
                description={intl.formatMessage({ id: 'documents.empty.description' })}
              >
                <Button loading={create.isPending} onClick={createDocument}>
                  {intl.formatMessage({ id: 'documents.new' })}
                </Button>
              </StateMessage>
            }
          />
        </section>
      )}
      <DocumentActionDialogs actions={actions} onArchived={(document) => setArchivedHere(document.title)} />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </>
  )
}
