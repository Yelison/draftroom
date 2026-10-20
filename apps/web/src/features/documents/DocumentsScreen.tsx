import { Button } from '@yelison/forma-ui'
import { useDeferredValue, useEffect, useState } from 'react'
import { useIntl } from 'react-intl'
import { useLocation, useNavigate } from 'react-router'
import { TemplatePickerDialog } from '../templates/TemplatePickerDialog.tsx'
import { useSearchSubmit } from '../search/useSearchSubmit.ts'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { focusMainContent } from '../../app/mainContent.ts'
import { problemMessageId } from './problemMessage.ts'
import { DocumentActionDialogs } from './actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from './actions/useActionDialogs.ts'
import { useCreateDocument } from './actions/useCreateDocument.ts'
import { archivedTitleFrom } from './archivedNotice.ts'
import { DocumentCollection } from './DocumentCollection.tsx'
import { DocumentsSkeleton } from './ListSkeleton.tsx'
import { ListToolbar } from './ListToolbar.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { WorkspaceGate } from './WorkspaceGate.tsx'
import { DocumentSections } from './sections/DocumentSections.tsx'
import { useSectionFolds } from './sections/useSectionFolds.ts'
import { searchTerm } from './searchTerm.ts'
import layout from './ListLayout.module.css'
import styles from './DocumentsScreen.module.css'

/**
 * The screen of `/documents`: the documents of the workspace in sections (pinned, one for each folder, those in no folder),
 * with a search over the documents that takes the place of the sections while it is typed. The
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
  const [search, setSearch] = useState('')
  const [pickingTemplate, setPickingTemplate] = useState(false)
  const deferredSearch = useDeferredValue(search)
  const submitSearch = useSearchSubmit(search)
  const term = searchTerm(deferredSearch)
  const folds = useSectionFolds()
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

  const createDocument = () => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })

  return (
    <>
      <ListToolbar search={search} onSearch={setSearch} onSearchKeyDown={submitSearch}>
        <MoreMenu
          onNewFolder={() => actions.open({ kind: 'create-folder', workspaceId })}
          onFromTemplate={() => setPickingTemplate(true)}
        />
        <Button loading={create.isPending} icon="plus" onClick={createDocument}>
          {intl.formatMessage({ id: 'documents.new' })}
        </Button>
      </ListToolbar>
      <TemplatePickerDialog open={pickingTemplate} onClose={() => setPickingTemplate(false)} />
      {create.isError && (
        <p role="alert" className={styles.problem}>
          {intl.formatMessage({ id: problemMessageId(create.error) })}
        </p>
      )}
      {term === undefined ? (
        <DocumentSections
          workspaceId={workspaceId}
          folds={folds}
          onRenameFolder={(folder) => actions.open({ kind: 'rename-folder', folder })}
          onRenameOrMove={(document) => actions.open({ kind: 'details', document })}
          onArchive={(document) => actions.open({ kind: 'archive', document })}
          firstDocument={
            <Button loading={create.isPending} onClick={createDocument}>
              {intl.formatMessage({ id: 'documents.new' })}
            </Button>
          }
        />
      ) : (
        <DocumentCollection
          workspaceId={workspaceId}
          term={term}
          empty={null}
          onActions={(document) => actions.open({ kind: 'details', document })}
          onArchive={(document) => actions.open({ kind: 'archive', document })}
        />
      )}
      <DocumentActionDialogs actions={actions} onArchived={(document) => setArchivedHere(document.title)} />
      <p role="status" className="forma-visually-hidden">
        {announcement}
      </p>
    </>
  )
}
