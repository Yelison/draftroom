import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import styles from './PageTitle.module.css'

export interface PageTitleProps {
  titleId: MessageId
}

/**
 * The headline of a page, and the title of the tab with it. The heading takes the focus when the person navigates to
 * the page (`useFocusOnNavigation`), which is why it can be focused by a script but is not a stop of the Tab key.
 */
export function PageTitle({ titleId }: PageTitleProps) {
  const intl = useIntl()
  const title = intl.formatMessage({ id: titleId })

  return (
    <>
      {/* React 19 moves a <title> rendered anywhere into <head>, so the tab follows the language of the app. */}
      <title>{intl.formatMessage({ id: 'app.documentTitle' }, { page: title })}</title>
      <h1 tabIndex={-1} className={styles.title}>
        {title}
      </h1>
    </>
  )
}
