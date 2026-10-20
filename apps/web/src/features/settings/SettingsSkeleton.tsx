import { useIntl } from 'react-intl'
import styles from './Settings.module.css'

const box = (shape: 'Field' | 'Choices' | 'Row') => (
  <div className={`${styles.skeleton} ${styles[`skeleton${shape}`]}`} />
)

/**
 * What the dialog shows while it is on its way: its three sections with the height of the real ones (a heading, then
 * fields and choices), so nothing moves when the data arrives.
 */
export function SettingsSkeleton() {
  const intl = useIntl()
  const heading = <div className={`${styles.skeleton} ${styles.skeletonHeading}`} />

  return (
    <div aria-busy="true" className={styles.form}>
      <div className={styles.section}>
        {heading}
        <div className={styles.pair}>
          {box('Field')}
          {box('Field')}
        </div>
        {box('Row')}
      </div>
      <div className={styles.section}>
        {heading}
        <div className={styles.pair}>
          {box('Choices')}
          {box('Choices')}
        </div>
      </div>
      <div className={styles.section}>
        {heading}
        {box('Field')}
      </div>
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'settings.loading' })}
      </p>
    </div>
  )
}
