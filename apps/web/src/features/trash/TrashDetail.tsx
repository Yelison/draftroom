import type { Schema } from '@draftroom/contract'
import { Button, Icon } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import styles from './Trash.module.css'

export interface TrashDetailProps {
  document: Schema<'Document'>
  /** The name of the folder the document was archived from; `null` when it has none or the folder is gone. */
  folderName: string | null
  restoring: boolean
  /** Why the last restore or delete of this document did not happen, said where the person acted. */
  problem: string | null
  onRestore: (document: Schema<'Document'>) => void
  onDelete: (document: Schema<'Document'>) => void
}

/**
 * What the selected document is and what can be done with it: the reversible action first and the one that cannot be
 * undone after a separator, with its consequences said beside it. Deleting still asks before it does it.
 */
export function TrashDetail({ document, folderName, restoring, problem, onRestore, onDelete }: TrashDetailProps) {
  const intl = useIntl()
  const titleId = useId()
  const problemId = useId()
  const archivedAt = document.archivedAt ?? document.updatedAt
  const day = (date: string) => <time dateTime={date}>{intl.formatDate(date, { dateStyle: 'medium' })}</time>

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.panelTitle}>
        <Icon name="file" className={styles.rowIcon} />
        <span>{document.title}</span>
      </h2>
      <dl className={styles.facts}>
        <dt>{intl.formatMessage({ id: 'trash.detail.archived' })}</dt>
        <dd>{day(archivedAt)}</dd>
        <dt>{intl.formatMessage({ id: 'trash.detail.folder' })}</dt>
        <dd>{folderName ?? intl.formatMessage({ id: 'documents.details.noFolder' })}</dd>
        <dt>{intl.formatMessage({ id: 'trash.detail.created' })}</dt>
        <dd>{day(document.createdAt)}</dd>
      </dl>
      <p className={styles.panelText}>{intl.formatMessage({ id: 'trash.detail.restoreHint' })}</p>
      <Button
        block
        loading={restoring}
        aria-describedby={problem === null ? undefined : problemId}
        onClick={() => onRestore(document)}
      >
        {intl.formatMessage({ id: 'trash.detail.restore' })}
      </Button>
      {problem !== null && (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <hr className={styles.separator} />
      <p className={styles.consequence}>{intl.formatMessage({ id: 'trash.delete.description' })}</p>
      <Button
        block
        variant="danger"
        // A restore is on its way: deleting now would only be refused, blaming someone who did nothing.
        disabled={restoring}
        aria-describedby={problem === null ? undefined : problemId}
        onClick={() => onDelete(document)}
      >
        {intl.formatMessage({ id: 'trash.delete.action' })}
      </Button>
    </section>
  )
}
