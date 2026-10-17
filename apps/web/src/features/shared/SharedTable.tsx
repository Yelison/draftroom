import type { Schema } from '@draftroom/contract'
import { buttonClassName } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'
import { Permission } from '../../components/Permission/Permission.tsx'
import styles from './Shared.module.css'

export interface SharedTableProps {
  documents: readonly Schema<'Document'>[]
  selectedId: string | undefined
  /** A preview is open beside the table: it says who made the document and when it changed, so the table gives the room back. */
  previewing: boolean
  onSelect: (document: Schema<'Document'>) => void
  /** Hands the button that previews a document to the list, which puts the focus back on it when the preview closes. */
  previewButton: (documentId: string) => (button: HTMLButtonElement | null) => void
}

/** The documents shared with the person: who made each, what the person can do with it and when it changed. */
export function SharedTable({ documents, selectedId, previewing, onSelect, previewButton }: SharedTableProps) {
  const intl = useIntl()

  return (
    <table
      className={styles.table}
      data-previewing={previewing ? '' : undefined}
      aria-label={intl.formatMessage({ id: 'shared.table.label' })}
    >
      <thead>
        <tr>
          <th scope="col" className={styles.nameColumn}>
            {intl.formatMessage({ id: 'shared.column.name' })}
          </th>
          <th scope="col" className={styles.createdByColumn}>
            {intl.formatMessage({ id: 'shared.column.createdBy' })}
          </th>
          <th scope="col" className={styles.permissionColumn}>
            {intl.formatMessage({ id: 'shared.column.permission' })}
          </th>
          <th scope="col" className={styles.updatedColumn}>
            {intl.formatMessage({ id: 'shared.column.updated' })}
          </th>
          <th scope="col" className={styles.openColumn}>
            <span className="forma-visually-hidden">{intl.formatMessage({ id: 'shared.column.open' })}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {documents.map((document) => (
          <tr key={document.id} data-selected={document.id === selectedId ? '' : undefined}>
            <td>
              <button
                type="button"
                ref={previewButton(document.id)}
                aria-pressed={document.id === selectedId}
                className={styles.nameButton}
                onClick={() => onSelect(document)}
              >
                {document.title}
              </button>
            </td>
            <td className={styles.createdByColumn}>{document.createdBy.name}</td>
            <td>
              <Permission role={document.role} />
            </td>
            <td className={styles.updatedColumn}>{intl.formatDate(document.updatedAt, { dateStyle: 'medium' })}</td>
            <td>
              <Link
                to={`/documents/${document.id}`}
                className={buttonClassName({ variant: 'secondary', size: 'compact' })}
                aria-label={intl.formatMessage({ id: 'shared.row.openLabel' }, { title: document.title })}
              >
                {intl.formatMessage({ id: 'shared.row.open' })}
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
