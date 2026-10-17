import { useQuery } from '@tanstack/react-query'
import { Icon } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { meQuery } from '../editor/meQuery.ts'
import styles from './AccountControl.module.css'
import { useSignOut } from './useSignOut.ts'

export interface AccountControlProps {
  /** `expanded` puts the label beside the icon; `compact` puts it under it, as the rail of the editor does. */
  variant: 'expanded' | 'compact'
}

/** Signing out, at the foot of the rail on every page of the app. It says why when it could not. */
export function AccountControl({ variant }: AccountControlProps) {
  const intl = useIntl()
  const me = useQuery(meQuery(useDataSource()))
  const { signOut, pending, failure, dialogs } = useSignOut()
  if (me.data === undefined) return null
  const person = me.data

  return (
    <div className={`${styles.account} ${styles[variant]}`}>
      <button
        type="button"
        className={styles.button}
        aria-busy={pending || undefined}
        onClick={() => {
          if (!pending) signOut(person.id)
        }}
      >
        <Icon name="lock" size={24} />
        <span className={styles.label}>{intl.formatMessage({ id: 'auth.signOut.action' })}</span>
      </button>
      {failure !== null && (
        <p role="alert" className={styles.failed}>
          {intl.formatMessage({ id: 'auth.signOut.failed' })}
        </p>
      )}
      {dialogs}
    </div>
  )
}
