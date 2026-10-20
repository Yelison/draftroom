import type { Schema } from '@draftroom/contract'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { SharedRow } from './SharedRow.tsx'
import type { SharedGroup, SharedRole } from './groupByRole.ts'
import styles from './Shared.module.css'

const copy: Record<SharedRole, { title: MessageId; description: MessageId }> = {
  editor: { title: 'shared.section.editor.title', description: 'shared.section.editor.description' },
  commenter: { title: 'shared.section.commenter.title', description: 'shared.section.commenter.description' },
  viewer: { title: 'shared.section.viewer.title', description: 'shared.section.viewer.description' },
}

/**
 * What the person can do, said as a sentence, and the documents they can do it with. The count is in the name of the
 * section for a screen reader and is not drawn, since the rows are the count.
 */
export function SharedSection({ group }: { group: SharedGroup<Schema<'Document'>> }) {
  const intl = useIntl()
  const headingId = useId()
  const countId = useId()

  return (
    <section className={styles.section} data-role={group.role} aria-labelledby={`${headingId} ${countId}`}>
      <div className={styles.sectionHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          {intl.formatMessage({ id: copy[group.role].title })}
        </h2>
        <span id={countId} className="forma-visually-hidden">
          {intl.formatMessage({ id: 'shared.section.count' }, { count: group.documents.length })}
        </span>
        <p className={styles.sectionDescription}>{intl.formatMessage({ id: copy[group.role].description })}</p>
      </div>
      <ul className={styles.rows}>
        {group.documents.map((document) => (
          <SharedRow key={document.id} document={document} />
        ))}
      </ul>
    </section>
  )
}
