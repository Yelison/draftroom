import { useIntl } from 'react-intl'
import { useCommentsView } from '../comments/commentsView.ts'
import band from './DocumentBand.module.css'
import bar from './DocumentBar.module.css'
import page from './DocumentPage.module.css'
import styles from './EditorSkeleton.module.css'

/**
 * What the screen shows while the document is on its way: the band, the bar and the sheet with the margin beside it, with
 * the same measures the document has, so nothing moves when it arrives. The text for a screen reader is a live region that
 * is already in the page.
 */
export function EditorSkeleton() {
  const intl = useIntl()
  const { marginShown } = useCommentsView()

  return (
    <div className={page.page} aria-busy="true">
      <div className={page.chrome}>
        <div className={band.band} />
        <div className={bar.bar} />
      </div>
      <div className={marginShown ? `${page.stage} ${page.withMargin}` : page.stage}>
        <div className={page.sheet}>
          <div className={styles.title} />
          <div className={styles.text}>
            <div className={styles.line} />
            <div className={styles.line} />
            <div className={styles.shortLine} />
          </div>
        </div>
        {marginShown && (
          <div className={styles.margin}>
            <div className={styles.card} />
            <div className={styles.card} />
          </div>
        )}
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'editor.loading' })}
      </p>
    </div>
  )
}
