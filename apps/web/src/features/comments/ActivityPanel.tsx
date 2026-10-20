import { IconButton } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { DocumentActivity } from '../history/DocumentActivity.tsx'
import styles from './ActivityPanel.module.css'

/**
 * What happened to the document, at the edge of the window over the margin: the one place of the editor that lists things
 * apart from the text. It has a scroll of its own, since the list is long, and it is there only while the person asks for it.
 */
export function ActivityPanel({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const intl = useIntl()

  return (
    <aside className={styles.panel} aria-label={intl.formatMessage({ id: 'comments.tab.activity' })}>
      <div className={styles.head}>
        <h2 className={styles.title}>{intl.formatMessage({ id: 'comments.tab.activity' })}</h2>
        <IconButton icon="close" label={intl.formatMessage({ id: 'comments.activity.close' })} onClick={onClose} />
      </div>
      <div className={styles.body}>
        <DocumentActivity documentId={documentId} />
      </div>
    </aside>
  )
}
