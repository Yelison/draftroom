import type { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import styles from './VersionReader.module.css'

// The frame of the reader is apart from the reader: the route's skeleton shows it, and that is loaded with the app, while
// the reader brings Tiptap and Yjs, which only the screen's own chunk may.

/** The panel beside the list, which is there before there is anything to read in it. */
export function ReaderPanel({ children }: { children?: ReactNode }) {
  const intl = useIntl()
  return (
    <section className={styles.panel} aria-label={intl.formatMessage({ id: 'versions.reader.label' })}>
      {children}
    </section>
  )
}

/** The panel while the versions are on their way: the room the text will take, so nothing moves when it arrives. */
export function ReaderPlaceholder() {
  return (
    <ReaderPanel>
      <div aria-busy="true" className={styles.skeleton} />
    </ReaderPanel>
  )
}
