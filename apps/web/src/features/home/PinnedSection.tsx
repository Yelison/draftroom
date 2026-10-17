import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './Home.module.css'

/** The heading of the pinned documents and what is under it, which is the same section whatever state it is in. */
export function PinnedSection({ children }: { children: ReactNode }) {
  const intl = useIntl()

  return (
    <section aria-labelledby="home-pinned">
      <h2 id="home-pinned" className={styles.group}>
        {intl.formatMessage({ id: 'home.pinned.title' })}
      </h2>
      {children}
    </section>
  )
}
