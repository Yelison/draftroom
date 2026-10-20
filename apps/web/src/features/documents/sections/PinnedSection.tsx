import type { Schema } from '@draftroom/contract'
import { useRef } from 'react'
import { useIntl } from 'react-intl'
import { DocumentListRow, type DocumentListRowProps } from '../DocumentListRow.tsx'
import rows from '../DocumentRows.module.css'
import { SectionFrame, toggleIdOf } from './SectionFrame.tsx'
import { useFocusAfterRemoval } from './useFocusAfterRemoval.ts'

export interface PinnedSectionProps extends Pick<DocumentListRowProps, 'onRenameOrMove' | 'onArchive'> {
  documents: readonly Schema<'Document'>[]
  /** The names of the folders by id, so each row says where its document is. */
  folderNames: ReadonlyMap<string, string>
  expanded: boolean
  onToggle: () => void
}

/** The documents the person pinned, from every folder, each with the name of its folder. */
export function PinnedSection({ documents, folderNames, expanded, onToggle, ...actions }: PinnedSectionProps) {
  const intl = useIntl()
  const list = useRef<HTMLUListElement>(null)
  const onFocus = useFocusAfterRemoval(
    list,
    documents.map((document) => document.id),
    () => document.getElementById(toggleIdOf('pinned')),
  )

  return (
    <SectionFrame
      sectionKey="pinned"
      title={intl.formatMessage({ id: 'documents.section.pinned' })}
      icon="star"
      expanded={expanded}
      onToggle={onToggle}
    >
      <ul ref={list} className={rows.rows} onFocus={onFocus}>
        {documents.map((document) => {
          const folderName = document.folderId === null ? undefined : folderNames.get(document.folderId)
          return (
            <DocumentListRow
              key={document.id}
              document={document}
              {...(folderName === undefined ? {} : { folderName })}
              {...actions}
            />
          )
        })}
      </ul>
    </SectionFrame>
  )
}
