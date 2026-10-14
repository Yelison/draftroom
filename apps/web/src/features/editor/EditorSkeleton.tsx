import { useIntl } from 'react-intl'
import sheet from './Sheet.module.css'
import styles from './EditorSkeleton.module.css'

/**
 * What the screen shows while the document is on its way: the toolbar's band and the sheet, with the same measures the
 * document has, so nothing moves when it arrives. The text for a screen reader is a live region that is already in the
 * page.
 */
export function EditorSkeleton() {
  const intl = useIntl()

  return (
    <div className={sheet.column} aria-busy="true">
      <div className={sheet.toolbarBand} />
      <div className={sheet.sheet}>
        <div className={styles.title} />
        <div className={styles.text}>
          <div className={styles.line} />
          <div className={styles.line} />
          <div className={styles.shortLine} />
        </div>
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'editor.loading' })}
      </p>
    </div>
  )
}
