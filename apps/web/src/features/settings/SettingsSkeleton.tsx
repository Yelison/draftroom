import { useIntl } from 'react-intl'
import styles from './Settings.module.css'

/** What a tab shows while it is on its way: fields with the height of the real ones, so nothing moves when it arrives. */
export function SettingsSkeleton({ fields = 2 }: { fields?: number }) {
  const intl = useIntl()

  return (
    <div aria-busy="true" className={styles.skeletons}>
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className={styles.skeleton} />
      ))}
      <p role="status" className="forma-visually-hidden">
        {intl.formatMessage({ id: 'settings.loading' })}
      </p>
    </div>
  )
}
