import { useIntl } from 'react-intl'
import { SectionFrame } from './SectionFrame.tsx'
import { SectionRows, type SectionRowsProps } from './SectionRows.tsx'

export interface UnfiledSectionProps extends Pick<SectionRowsProps, 'data' | 'onRenameOrMove' | 'onArchive'> {
  expanded: boolean
  onToggle: () => void
}

/** The documents that are in no folder. The screen asks for them, because it also needs to know when there are none. */
export function UnfiledSection({ expanded, onToggle, ...rows }: UnfiledSectionProps) {
  const intl = useIntl()
  const name = intl.formatMessage({ id: 'documents.section.unfiled' })

  return (
    <SectionFrame sectionKey="unfiled" title={name} icon="file" expanded={expanded} onToggle={onToggle}>
      <SectionRows sectionKey="unfiled" name={name} empty={null} {...rows} />
    </SectionFrame>
  )
}
