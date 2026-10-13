import { Button } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { PreferencesPanel } from '../features/preferences/PreferencesPanel.tsx'
import styles from './HomeRoute.module.css'

/** The first screen: a headline and its main action, with the language and theme choices above them. */
export function HomeRoute() {
  const intl = useIntl()

  return (
    <>
      {/* React 19 moves a <title> rendered anywhere into <head>, so the tab follows the language of the app. */}
      <title>{intl.formatMessage({ id: 'home.documentTitle' })}</title>
      <main className={styles.page}>
        <PreferencesPanel />
        <h1 className={styles.title}>{intl.formatMessage({ id: 'home.title' })}</h1>
        <p className={styles.description}>{intl.formatMessage({ id: 'home.description' })}</p>
        <Button variant="primary">{intl.formatMessage({ id: 'home.newDocument' })}</Button>
      </main>
    </>
  )
}
