import { useIntl } from 'react-intl'
import type { DocumentRowOptions } from '../DocumentListRow.tsx'
import { SectionFrame } from './SectionFrame.tsx'
import { SectionRows, type SectionRowsProps } from './SectionRows.tsx'

export interface UnfiledSectionProps extends Pick<SectionRowsProps, 'data'>, DocumentRowOptions {
  expanded: boolean
  onToggle: () => void
}

/** The documents that are in no folder. The screen asks for them, because it also needs to know when there are none. */
export function UnfiledSection({ expanded, onToggle, ...rows }: UnfiledSectionProps) {
  const intl = useIntl()
  const name = intl.formatMessage({ id: 'documents.section.unfiled' })

  return (
    <SectionFrame
      sectionKey="unfiled"
      title={name}
      icon="file"
      expanded={expanded}
      onToggle={onToggle}
      compact={rows.compact === true}
    >
      <SectionRows sectionKey="unfiled" name={name} empty={null} {...rows} />
    </SectionFrame>
  )
}
