import { useIntl } from 'react-intl'
import { Link, useLocation } from 'react-router'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './AuthSwitch.module.css'

const screens: { to: string; labelId: MessageId }[] = [
  { to: '/sign-in', labelId: 'auth.switch.signIn' },
  { to: '/sign-up', labelId: 'auth.switch.signUp' },
]

/**
 * The two screens of the pair as links to their routes, not tabs of one: each has its own address, and the place the person
 * was going to (`location.state`) goes with them from one to the other. The one that is open is marked as the page.
 */
export function AuthSwitch() {
  const intl = useIntl()
  const { pathname, state } = useLocation()

  return (
    <nav aria-label={intl.formatMessage({ id: 'auth.switch.label' })}>
      <ul className={styles.list}>
        {screens.map(({ to, labelId }) => (
          <li key={to}>
            <Link to={to} state={state} className={styles.link} aria-current={pathname === to ? 'page' : undefined}>
              {intl.formatMessage({ id: labelId })}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
