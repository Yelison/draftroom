import type { Schema } from '@draftroom/contract'
import { IconButton } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../components/DocumentRow/DocumentRow.tsx'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'

export interface DocumentCardProps {
  document: Schema<'Document'>
  /** Opens the dialog that renames or moves it. Only people who can do either are offered it. */
  onActions: (document: Schema<'Document'>) => void
}

/** A document in a list: its title opens it, and its actions button renames, moves or archives it. */
export function DocumentCard({ document, onActions }: DocumentCardProps) {
  const intl = useIntl()
  const canChange = document.role === 'editor' || document.role === 'owner'

  return (
    <DocumentRow
      card
      variant={document.archivedAt === null ? 'default' : 'archived'}
      title={<DocumentRowLink to={`/documents/${document.id}`}>{document.title}</DocumentRowLink>}
      meta={intl.formatMessage(
        { id: 'documents.row.updated' },
        { date: intl.formatDate(document.updatedAt, { dateStyle: 'medium' }) },
      )}
      trailing={
        canChange && (
          <IconButton
            icon="more"
            label={intl.formatMessage({ id: 'documents.row.actions' }, { title: document.title })}
            onClick={() => onActions(document)}
          />
        )
      }
    />
  )
}
