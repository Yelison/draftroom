import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { ListSkeleton } from '../documents/ListSkeleton.tsx'
import layout from '../documents/ListLayout.module.css'
import { History } from './History.tsx'
import styles from './History.module.css'

/**
 * The screen of `/history`: what happened across the documents the person can read. The headline is outside everything
 * that loads, so the focus that navigation puts on it has somewhere to stay.
 */
export function HistoryScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.history" />
      <WorkspaceGate loading={<ListSkeleton rows={6} listClassName={styles.skeleton} label="history.loading" />}>
        {(workspaceId) => <History workspaceId={workspaceId} />}
      </WorkspaceGate>
    </div>
  )
}
