import type { Schema } from '@draftroom/contract'
import { ArchiveDocumentDialog } from './ArchiveDocumentDialog.tsx'
import { DocumentDetailsDialog } from './DocumentDetailsDialog.tsx'
import { FolderNameDialog } from './FolderNameDialog.tsx'
import type { ActionDialogs } from './useActionDialogs.ts'

export interface DocumentActionDialogsProps {
  actions: ActionDialogs
  /** Called after a document was archived from a place that stays on screen, to announce it. */
  onArchived: (document: Schema<'Document'>) => void
}

/** The dialogs that act on documents and folders, one of which is open at a time. Every screen that lists them has these. */
export function DocumentActionDialogs({ actions: { target, open, close }, onArchived }: DocumentActionDialogsProps) {
  const folderTarget =
    target?.kind === 'create-folder'
      ? ({ kind: 'create', workspaceId: target.workspaceId } as const)
      : target?.kind === 'rename-folder'
        ? ({ kind: 'rename', folder: target.folder } as const)
        : null

  return (
    <>
      <DocumentDetailsDialog
        document={target?.kind === 'details' ? target.document : null}
        onClose={close}
        onArchive={(document) => open({ kind: 'archive', document })}
      />
      <ArchiveDocumentDialog
        document={target?.kind === 'archive' ? target.document : null}
        onClose={close}
        onArchived={(document) => {
          close()
          onArchived(document)
        }}
      />
      <FolderNameDialog target={folderTarget} onClose={close} />
    </>
  )
}
