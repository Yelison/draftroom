import { useIntl } from 'react-intl'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import { TilesSkeleton } from './TilesSkeleton.tsx'
import styles from './Home.module.css'

/**
 * What Home shows while the workspace is on its way: the first two blocks with the measures of the real ones, the
 * words in blanks so their height is the real height whatever the type is. It is what Home itself starts with, so
 * nothing moves when the workspace arrives.
 */
export function HomeSkeleton() {
  const intl = useIntl()

  return (
    <>
      <p className={styles.workspaceName} />
      <div className={styles.sections}>
        <section aria-busy="true" className={styles.start}>
          <div className={styles.startHead}>
            <div>
              <p className={styles.startTitle}>&nbsp;</p>
              <p className={styles.startDescription}>&nbsp;</p>
            </div>
            <div className={styles.startButtonSkeleton} />
          </div>
          <div>
            <p className={styles.tilesLabel}>&nbsp;</p>
            <TilesSkeleton />
          </div>
          <p role="status" className="forma-visually-hidden">
            {intl.formatMessage({ id: 'home.loading' })}
          </p>
        </section>
        <section>
          <p className={styles.group}>&nbsp;</p>
          <ListSkeleton
            rows={3}
            listClassName={`${styles.cards} ${styles.cardsSkeleton}`}
            label="home.recent.loading"
          />
        </section>
      </div>
    </>
  )
}
