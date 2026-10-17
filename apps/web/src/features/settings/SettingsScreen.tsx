import { Tabs } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { Outlet, useMatch, useNavigate } from 'react-router'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { isSettingsTab, settingsTabs } from './settingsTabs.ts'
import styles from './Settings.module.css'

/**
 * The screen of `/settings`: its headline, which the focus that navigation puts there has somewhere to stay on, and the
 * tabs. Every tab is a route of its own, so an address opens the tab it names and the back button walks through them;
 * the route shows its panel in the one that is selected.
 */
export function SettingsScreen() {
  const intl = useIntl()
  const navigate = useNavigate()
  const selected = useMatch('/settings/:tab')?.params.tab

  return (
    <div className={styles.screen}>
      <PageTitle titleId="nav.settings" />
      <Tabs
        label={intl.formatMessage({ id: 'settings.tabs.label' })}
        {...(selected === undefined ? {} : { value: selected })}
        onChange={(tab) => {
          if (isSettingsTab(tab)) void navigate(`/settings/${tab}`)
        }}
        items={settingsTabs.map((tab) => ({
          id: tab,
          label: intl.formatMessage({ id: `settings.tab.${tab}` }),
          content: tab === selected ? <Outlet /> : null,
        }))}
      />
    </div>
  )
}
