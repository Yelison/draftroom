import type { Schema } from '@draftroom/contract'
import { Link } from 'react-router'
import styles from './Timeline.module.css'

/**
 * The name of a document, as the way to it. The event does not say whether the document has been archived since, and the
 * editor already tells a person who opens one that cannot be opened, so the link is always there.
 */
export function DocumentLink({ document }: { document: Schema<'ActivityEvent'>['document'] }) {
  return (
    <Link to={`/documents/${document.id}`} className={styles.documentLink}>
      {document.title}
    </Link>
  )
}
