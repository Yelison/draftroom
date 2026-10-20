import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { focusMainContent } from '../../../app/mainContent.ts'
import { useDataSource } from '../../../data/useDataSource.ts'
import type { DocumentListRowProps } from '../DocumentListRow.tsx'
import { foldersQuery, pinnedDocumentsQuery } from '../queries.ts'
import { FolderSection } from './FolderSection.tsx'
import { PinnedSection } from './PinnedSection.tsx'
import { SectionFailure } from './SectionFailure.tsx'
import { DocumentSectionsSkeleton } from './SectionSkeleton.tsx'
import { UnfiledSection } from './UnfiledSection.tsx'
import type { SectionFolds } from './useSectionFolds.ts'
import { useSectionDocuments } from './useSectionDocuments.ts'
import { StateMessage } from '../StateMessage.tsx'
import styles from './Sections.module.css'

export interface DocumentSectionsProps extends Pick<DocumentListRowProps, 'onRenameOrMove' | 'onArchive'> {
  workspaceId: string
  folds: SectionFolds
  onRenameFolder: Parameters<typeof FolderSection>[0]['onRename']
  /** The way to the first document, for a workspace that has none. */
  firstDocument: ReactNode
}

/**
 * The documents of the workspace by where they are: the pinned ones first, then a section for each folder, then those in
 * no folder. Each section reads its own documents, so one that fails says so and can be tried again without the others.
 *
 * The page waits for the three reads that decide which sections exist (the folders, the pinned documents and the
 * documents with no folder) and then draws them together; the documents of each folder arrive under their own heading.
 */
export function DocumentSections({
  workspaceId,
  folds,
  onRenameFolder,
  firstDocument,
  ...actions
}: DocumentSectionsProps) {
  const intl = useIntl()
  const dataSource = useDataSource()
  const folders = useQuery(foldersQuery(dataSource, workspaceId))
  const pinned = useQuery(pinnedDocumentsQuery(dataSource, workspaceId))
  const unfiled = useSectionDocuments(workspaceId, { unfiled: true }, folds.isExpanded('unfiled'))
  const folderNames = useMemo(
    () => new Map(folders.data?.items.map((folder) => [folder.id, folder.name])),
    [folders.data],
  )

  const pinnedCount = pinned.data?.items.length ?? 0
  // Until it has been read, "No folder" is drawn (loading or failed); once read, it is drawn only if it lists something.
  const showUnfiled = !unfiled.query.isSuccess || unfiled.documents.length > 0 || unfiled.query.hasNextPage

  // "Pinned" and "No folder" leave the page when their last document does, and the heading that had the focus with them.
  const sectionsShown = useRef<number | null>(null)
  const shown = Number(pinnedCount > 0) + Number(showUnfiled)
  useEffect(() => {
    if (sectionsShown.current !== null && shown < sectionsShown.current && document.activeElement === document.body) {
      focusMainContent()
    }
    sectionsShown.current = shown
  }, [shown])

  if (folders.isPending || pinned.isPending || (unfiled.query.isPending && folds.isExpanded('unfiled'))) {
    return <DocumentSectionsSkeleton />
  }

  const nothingAtAll =
    folders.isSuccess &&
    folders.data.items.length === 0 &&
    pinned.isSuccess &&
    pinnedCount === 0 &&
    unfiled.firstPageEmpty
  if (nothingAtAll) {
    return (
      <StateMessage
        title={intl.formatMessage({ id: 'documents.empty.title' })}
        description={intl.formatMessage({ id: 'documents.empty.description' })}
      >
        {firstDocument}
      </StateMessage>
    )
  }

  return (
    <div className={styles.sections}>
      {pinned.isError && (
        <div className={styles.section}>
          <SectionFailure
            name={intl.formatMessage({ id: 'documents.section.pinned' })}
            onRetry={() => void pinned.refetch()}
            retrying={pinned.isFetching}
          />
        </div>
      )}
      {pinnedCount > 0 && pinned.data !== undefined && (
        <PinnedSection
          documents={pinned.data.items}
          folderNames={folderNames}
          expanded={folds.isExpanded('pinned')}
          onToggle={() => folds.toggle('pinned')}
          {...actions}
        />
      )}
      {folders.isError && (
        <div className={styles.section}>
          <SectionFailure
            name={intl.formatMessage({ id: 'documents.section.folders' })}
            onRetry={() => void folders.refetch()}
            retrying={folders.isFetching}
          />
        </div>
      )}
      {folders.data?.items.map((folder) => (
        <FolderSection
          key={folder.id}
          workspaceId={workspaceId}
          folder={folder}
          expanded={folds.isExpanded(folder.id)}
          onToggle={() => folds.toggle(folder.id)}
          onRename={onRenameFolder}
          {...actions}
        />
      ))}
      {showUnfiled && (
        <UnfiledSection
          data={unfiled}
          expanded={folds.isExpanded('unfiled')}
          onToggle={() => folds.toggle('unfiled')}
          {...actions}
        />
      )}
    </div>
  )
}
