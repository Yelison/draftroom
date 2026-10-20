import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { Home } from './Home.tsx'
import { HomeSkeleton } from './HomeSkeleton.tsx'
import layout from '../documents/ListLayout.module.css'

/**
 * The screen of `/`: where to start a document and what to pick up. The headline is outside everything that loads, so
 * the focus that navigation puts on it has somewhere to stay.
 */
export function HomeScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.home" />
      <WorkspaceGate loading={<HomeSkeleton />}>{(workspaceId) => <Home workspaceId={workspaceId} />}</WorkspaceGate>
    </div>
  )
}
