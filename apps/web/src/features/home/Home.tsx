import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { foldersQuery } from '../documents/queries.ts'
import { LatestEvent } from './LatestEvent.tsx'
import { PinnedDocuments } from './PinnedDocuments.tsx'
import { RecentDocuments } from './RecentDocuments.tsx'
import { StartSection } from './StartSection.tsx'
import { WorkspaceName } from './WorkspaceName.tsx'
import { latestEventQuery, pinnedDocumentsQuery, recentDocumentsQuery } from './queries.ts'
import styles from './Home.module.css'

/**
 * Everything is asked for at once, and each section shows its own state, so one that fails does not take the others
 * down. They are drawn from the top, each once the one above has its answer: a section that turns out to be empty (no
 * pinned documents, nothing that happened) would otherwise leave a gap, and the ones under it would move up into it.
 */
export function Home({ workspaceId }: { workspaceId: string }) {
  const dataSource = useDataSource()
  const recents = useInfiniteQuery(recentDocumentsQuery(dataSource, workspaceId))
  const folders = useQuery(foldersQuery(dataSource, workspaceId))
  const pinned = useQuery(pinnedDocumentsQuery(dataSource, workspaceId))
  const latest = useQuery(latestEventQuery(dataSource, workspaceId))
  const recentsAnswered = !recents.isPending && !folders.isPending
  const pinnedAnswered = recentsAnswered && !pinned.isPending

  return (
    <>
      <WorkspaceName workspaceId={workspaceId} />
      <div className={styles.sections}>
        <StartSection workspaceId={workspaceId} />
        <RecentDocuments recents={recents} folders={folders} />
        {recentsAnswered && <PinnedDocuments pinned={pinned} />}
        {pinnedAnswered && <LatestEvent latest={latest} />}
      </div>
    </>
  )
}
