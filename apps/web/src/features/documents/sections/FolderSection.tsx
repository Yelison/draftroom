import type { Schema } from '@draftroom/contract'
import { IconButton, Menu } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useNavigate } from 'react-router'
import { SectionFrame } from './SectionFrame.tsx'
import { SectionRows, type SectionRowsProps } from './SectionRows.tsx'
import { useSectionDocuments } from './useSectionDocuments.ts'

export interface FolderSectionProps extends Pick<SectionRowsProps, 'onRenameOrMove' | 'onArchive'> {
  workspaceId: string
  folder: Schema<'Folder'>
  expanded: boolean
  onToggle: () => void
  onRename: (folder: Schema<'Folder'>) => void
}

/**
 * The documents of one folder, which the section asks for only while it is open. The folder is drawn even when it has no
 * documents, so it can be seen and used. Its menu renames it and opens the folder's own page, which lists all of it.
 */
export function FolderSection({ workspaceId, folder, expanded, onToggle, onRename, ...actions }: FolderSectionProps) {
  const intl = useIntl()
  const navigate = useNavigate()
  const data = useSectionDocuments(workspaceId, { folderId: folder.id }, expanded)
  const label = intl.formatMessage({ id: 'documents.row.actions' }, { title: folder.name })

  return (
    <SectionFrame
      sectionKey={folder.id}
      title={folder.name}
      icon="folder"
      expanded={expanded}
      onToggle={onToggle}
      actions={
        <Menu
          label={label}
          items={[
            {
              id: 'open',
              label: intl.formatMessage({ id: 'documents.section.open' }),
              onSelect: () => void navigate(`/folders/${folder.id}`),
            },
            {
              id: 'rename',
              label: intl.formatMessage({ id: 'documents.folder.renameTitle' }),
              onSelect: () => onRename(folder),
            },
          ]}
        >
          {(trigger) => <IconButton {...trigger} icon="more" label={label} />}
        </Menu>
      }
    >
      <SectionRows
        sectionKey={folder.id}
        name={folder.name}
        data={data}
        empty={intl.formatMessage({ id: 'documents.empty.title' })}
        {...actions}
      />
    </SectionFrame>
  )
}
