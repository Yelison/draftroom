import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { PinnedDocuments } from './PinnedDocuments.tsx'
import { RecentActivity } from './RecentActivity.tsx'
import { pinnedDocumentsQuery } from './queries.ts'

/**
 * The pinned documents first, and the activity under them only once they are in: it would otherwise sit where the
 * documents are about to be and move down when they arrive.
 */
export function Home({ workspaceId }: { workspaceId: string }) {
  const dataSource = useDataSource()
  const pinned = useQuery(pinnedDocumentsQuery(dataSource, workspaceId))

  return (
    <>
      <PinnedDocuments workspaceId={workspaceId} pinned={pinned} />
      {!pinned.isPending && <RecentActivity workspaceId={workspaceId} />}
    </>
  )
}
