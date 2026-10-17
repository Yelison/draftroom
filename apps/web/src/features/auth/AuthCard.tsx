import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './Auth.module.css'

export interface AuthCardProps {
  titleId: MessageId
  descriptionId: MessageId
  children: ReactNode
  /** The way to the other screen of the pair, under the form. */
  footer: ReactNode
}

/** What sign-in and sign-up share: the headline, a line about it, the form and the way to the other screen. */
export function AuthCard({ titleId, descriptionId, children, footer }: AuthCardProps) {
  const intl = useIntl()

  return (
    <div className={styles.card}>
      <div>
        <PageTitle titleId={titleId} />
        <p className={styles.description}>{intl.formatMessage({ id: descriptionId })}</p>
      </div>
      {children}
      <p className={styles.footer}>{footer}</p>
    </div>
  )
}
