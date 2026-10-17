import { useIntl } from 'react-intl'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import styles from './Versions.module.css'

/** The body of the screen while the document is on its way: the list and the preview panel, with their measures. */
export function VersionsPlaceholder() {
  const intl = useIntl()
  return (
    <div className={styles.body}>
      <ListSkeleton rows={5} listClassName={styles.list} label="versions.loading" />
      <section className={styles.preview} aria-label={intl.formatMessage({ id: 'versions.preview.title' })} />
    </div>
  )
}

/** What the route shows while the screen's own code is on its way. */
export function VersionsSkeleton() {
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <PageTitle titleId="screen.versions" />
      </header>
      <VersionsPlaceholder />
    </div>
  )
}
