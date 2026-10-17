import { useIntl } from 'react-intl'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import layout from '../documents/ListLayout.module.css'
import { Shared } from './Shared.tsx'
import { SharedSkeleton } from './SharedSkeleton.tsx'
import styles from './Shared.module.css'

/**
 * The screen of `/shared`: what other people gave the person access to. The headline is outside everything that loads,
 * so the focus that navigation puts on it has somewhere to stay.
 */
export function SharedScreen() {
  const intl = useIntl()

  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.shared" />
      <p className={styles.description}>{intl.formatMessage({ id: 'shared.description' })}</p>
      <WorkspaceGate loading={<SharedSkeleton />}>
        {(workspaceId) => <Shared workspaceId={workspaceId} />}
      </WorkspaceGate>
    </div>
  )
}
