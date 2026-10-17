import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { Home } from './Home.tsx'
import { PinnedLoading } from './PinnedLoading.tsx'
import layout from '../documents/ListLayout.module.css'

/**
 * The screen of `/`: the documents the person pinned and what happened lately. The headline is outside everything that
 * loads, so the focus that navigation puts on it has somewhere to stay.
 */
export function HomeScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.home" />
      <WorkspaceGate loading={<PinnedLoading />}>{(workspaceId) => <Home workspaceId={workspaceId} />}</WorkspaceGate>
    </div>
  )
}
