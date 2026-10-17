import type { Schema } from '@draftroom/contract'
import { IconButton } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../components/DocumentRow/DocumentRow.tsx'
import { DocumentRowLink } from '../../components/DocumentRow/DocumentRowLink.tsx'
import { usePinDocument } from './actions/usePinDocument.ts'
import { PinButton } from './PinButton.tsx'
import { problemMessageId } from './problemMessage.ts'
import styles from './DocumentCard.module.css'

export interface DocumentCardProps {
  document: Schema<'Document'>
  /** Opens the dialog that renames or moves it. Only people who can do either are offered it. */
  onActions: (document: Schema<'Document'>) => void
}

/** A document in a list: its title opens it, its pin button pins it for the person, and its actions button renames, moves or archives it. */
export function DocumentCard({ document, onActions }: DocumentCardProps) {
  const intl = useIntl()
  const canChange = document.role === 'editor' || document.role === 'owner'
  const pin = usePinDocument()

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
        <span className={styles.actions}>
          {/* A toggle: the name stays and `aria-pressed` carries the state, which a screen reader says when it changes. */}
          <PinButton
            toggle
            pinned={document.pinned}
            label={intl.formatMessage({ id: 'documents.row.pin' }, { title: document.title })}
            // Not `disabled`: a disabled button gives up the focus, and the person is still on it when the answer arrives.
            onClick={() => {
              if (!pin.isPending) pin.mutate(document)
            }}
          />
          {pin.isError && (
            <span role="alert" className="forma-visually-hidden">
              {intl.formatMessage({ id: problemMessageId(pin.error) })}
            </span>
          )}
          {canChange && (
            <IconButton
              icon="more"
              label={intl.formatMessage({ id: 'documents.row.actions' }, { title: document.title })}
              onClick={() => onActions(document)}
            />
          )}
        </span>
      }
    />
  )
}
