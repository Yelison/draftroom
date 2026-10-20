import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import layout from '../documents/ListLayout.module.css'
import { FiltersPlaceholder } from './HistoryFilters.tsx'
import { History } from './History.tsx'
import { TimelineSkeleton } from './TimelineSkeleton.tsx'

/**
 * The screen of `/history`: what happened across the documents the person can read. The headline is outside everything
 * that loads, so the focus that navigation puts on it has somewhere to stay, and what stands in for the rest while the
 * workspace is on its way has the filters' place and the timeline's rows, so that nothing moves when they arrive.
 */
export function HistoryScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.history" />
      <WorkspaceGate
        loading={
          <>
            <FiltersPlaceholder />
            <TimelineSkeleton />
          </>
        }
      >
        {(workspaceId) => <History workspaceId={workspaceId} />}
      </WorkspaceGate>
    </div>
  )
}
