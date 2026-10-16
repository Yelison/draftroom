import type { Schema } from '@draftroom/contract'
import { Icon } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import styles from './ReadOnlyNotice.module.css'

/**
 * What a viewer or a commenter sees where an editor has the toolbar: they can read the document and not change it. It is
 * there when the document opens, so it is not a live region. The sync state says "Read-only" beside it for the connection.
 */
export function ReadOnlyNotice({ role }: { role: Extract<Schema<'DocumentRole'>, 'viewer' | 'commenter'> }) {
  const intl = useIntl()

  return (
    <p className={styles.notice}>
      <Icon name="lock" className={styles.icon} />
      {intl.formatMessage({ id: `editor.readOnly.${role}` })}
    </p>
  )
}
