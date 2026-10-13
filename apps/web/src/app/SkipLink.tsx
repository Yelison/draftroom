import { useIntl } from 'react-intl'
import { focusMainContent, mainContentId } from './mainContent.ts'
import styles from './SkipLink.module.css'

/** The first stop of the Tab key: it jumps over the rail to the page. It appears when it has the focus. */
export function SkipLink() {
  const intl = useIntl()

  return (
    <a
      href={`#${mainContentId}`}
      className={styles.link}
      // The address stays as it is: a fragment would be a navigation of its own for the router.
      onClick={(event) => {
        event.preventDefault()
        focusMainContent()
      }}
    >
      {intl.formatMessage({ id: 'app.skipToContent' })}
    </a>
  )
}
