import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import type { MessageId } from '../../i18n/messages.ts'
import { AuthSwitch } from './AuthSwitch.tsx'
import { BrandPanel } from './BrandPanel.tsx'
import styles from './Auth.module.css'

export interface AuthFrameProps {
  titleId: MessageId
  descriptionId: MessageId
  children: ReactNode
}

/** What sign-in and sign-up share: the brand beside the form, the way to the other screen, the headline and a line about it. */
export function AuthFrame({ titleId, descriptionId, children }: AuthFrameProps) {
  const intl = useIntl()

  return (
    <div className={styles.split}>
      <BrandPanel />
      <div className={styles.formSide}>
        <div className={styles.formColumn}>
          <AuthSwitch />
          <div>
            <PageTitle titleId={titleId} />
            <p className={styles.description}>{intl.formatMessage({ id: descriptionId })}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
