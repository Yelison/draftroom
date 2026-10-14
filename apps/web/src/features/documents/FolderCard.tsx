import type { Schema } from '@draftroom/contract'
import { IconButton } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../components/DocumentRow/DocumentRow.tsx'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'

export interface FolderCardProps {
  folder: Schema<'Folder'>
  onRename: (folder: Schema<'Folder'>) => void
}

/** A folder in a list: its name opens it, and its actions button renames it. Any member can rename a folder. */
export function FolderCard({ folder, onRename }: FolderCardProps) {
  const intl = useIntl()

  return (
    <DocumentRow
      card
      variant="folder"
      title={<DocumentRowLink to={`/folders/${folder.id}`}>{folder.name}</DocumentRowLink>}
      trailing={
        <IconButton
          icon="more"
          label={intl.formatMessage({ id: 'documents.row.actions' }, { title: folder.name })}
          onClick={() => onRename(folder)}
        />
      }
    />
  )
}
