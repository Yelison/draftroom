import { useIntl } from 'react-intl'
import { useCommentsPanel } from '../comments/commentsPanelState.ts'
import sheet from './Sheet.module.css'
import styles from './EditorSkeleton.module.css'

/**
 * What the screen shows while the document is on its way: the toolbar's band and the sheet, with the same measures the
 * document has, so nothing moves when it arrives. The text for a screen reader is a live region that is already in the
 * page.
 */
export function EditorSkeleton() {
  const intl = useIntl()
  const { open } = useCommentsPanel()

  return (
    <div className={open ? sheet.workspace : `${sheet.workspace} ${sheet.withoutPanel}`} aria-busy="true">
      <div className={sheet.column}>
        <div className={sheet.band} />
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
      {/* The place of the panel, so the sheet does not move when the document arrives. */}
      {open && <div className={styles.panel} />}
    </div>
  )
}
