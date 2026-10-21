import type { Schema } from '@draftroom/contract'
import { Button, SearchField } from '@yelison/forma-ui'
import { useDeferredValue, useState } from 'react'
import { useIntl } from 'react-intl'
import { useParams } from 'react-router'
import { focusMainContent } from '../../app/mainContent.ts'
import { DocumentActionDialogs } from '../documents/actions/DocumentActionDialogs.tsx'
import { useActionDialogs } from '../documents/actions/useActionDialogs.ts'
import { useCreateDocument } from '../documents/actions/useCreateDocument.ts'
import { DocumentCollection } from '../documents/DocumentCollection.tsx'
import { MoreMenu } from '../documents/MoreMenu.tsx'
import { problemMessageId } from '../documents/problemMessage.ts'
import { searchTerm } from '../documents/searchTerm.ts'
import { DocumentSections } from '../documents/sections/DocumentSections.tsx'
import { useSectionFolds } from '../documents/sections/useSectionFolds.ts'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { useSearchSubmit } from '../search/useSearchSubmit.ts'
import { TemplatePickerDialog } from '../templates/TemplatePickerDialog.tsx'
import { ExplorerSkeleton } from './ExplorerSkeleton.tsx'
import styles from './Explorer.module.css'

/** Only "Pinned" is open when a document opens, so opening one asks the server for no folder. */
const initiallyOpen = { sections: ['pinned'], folders: 0 } as const

/**
 * The column beside a document: search, the way to a new document, and the documents of the workspace in the sections of
 * the Documents screen (the pinned ones, a section for each folder, those in none), folded but for "Pinned", with the
 * document that is open marked. While a search is typed its results take the place of the sections.
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
  // The layout above the screens sees the parameters of the route below it, so this is the open document.
  const { documentId: openDocumentId } = useParams()
  const [search, setSearch] = useState('')
  const [pickingTemplate, setPickingTemplate] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const term = searchTerm(useDeferredValue(search))
  const submitSearch = useSearchSubmit(search)
  const folds = useSectionFolds(initiallyOpen)
  const actions = useActionDialogs(focusMainContent)
  const create = useCreateDocument(workspaceId)
  const createDocument = () => create.mutate({ title: intl.formatMessage({ id: 'documents.untitled' }) })
  const rowActions = {
    compact: true,
    ...(openDocumentId === undefined ? {} : { openDocumentId }),
    onRenameOrMove: (document: Schema<'Document'>) => actions.open({ kind: 'details', document }),
    onArchive: (document: Schema<'Document'>) => actions.open({ kind: 'archive', document }),
  }

  return (
    <div className={styles.content}>
      <div className={styles.header}>
        <SearchField
          label={intl.formatMessage({ id: 'documents.search.label' })}
          placeholder={intl.formatMessage({ id: 'documents.search.label' })}
          value={search}
          onValueChange={setSearch}
          onKeyDown={submitSearch}
        />
        <div className={styles.actions}>
          <Button loading={create.isPending} icon="plus" onClick={createDocument}>
            {intl.formatMessage({ id: 'documents.new' })}
          </Button>
          <MoreMenu
            onNewFolder={() => actions.open({ kind: 'create-folder', workspaceId })}
            onFromTemplate={() => setPickingTemplate(true)}
          />
        </div>
        {create.isError && (
          <p role="alert" className={styles.problem}>
            {intl.formatMessage({ id: problemMessageId(create.error) })}
          </p>
        )}
      </div>
      {term === undefined ? (
        <DocumentSections
          workspaceId={workspaceId}
          folds={folds}
          onRenameFolder={(folder) => actions.open({ kind: 'rename-folder', folder })}
          firstDocument={
            <Button loading={create.isPending} onClick={createDocument}>
              {intl.formatMessage({ id: 'documents.new' })}
            </Button>
          }
          {...rowActions}
        />
      ) : (
        <DocumentCollection
          workspaceId={workspaceId}
          term={term}
          empty={null}
          onActions={rowActions.onRenameOrMove}
          onArchive={rowActions.onArchive}
          compact
          {...(openDocumentId === undefined ? {} : { openDocumentId })}
        />
      )}
      <TemplatePickerDialog open={pickingTemplate} onClose={() => setPickingTemplate(false)} />
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
