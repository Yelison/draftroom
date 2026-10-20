import { useIntl } from 'react-intl'
import { NavLink, useLocation } from 'react-router'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './AuthSwitch.module.css'

const screens: { to: string; labelId: MessageId }[] = [
  { to: '/sign-in', labelId: 'auth.switch.signIn' },
  { to: '/sign-up', labelId: 'auth.switch.signUp' },
]

/**
 * The two screens of the pair as links to their routes, not tabs of one: each has its own address, and the place the person
 * was going to (`location.state`) goes with them from one to the other. The router marks the one that is open as the page.
 */
export function AuthSwitch() {
  const intl = useIntl()
  const { state } = useLocation()

  return (
    <nav aria-label={intl.formatMessage({ id: 'auth.switch.label' })}>
      <ul className={styles.list}>
        {screens.map(({ to, labelId }) => (
          // A function, since the class of a CSS Module is typed as possibly missing and the string prop does not take that.
          <li key={to}>
            <NavLink to={to} state={state} className={() => styles.link}>
              {intl.formatMessage({ id: labelId })}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
