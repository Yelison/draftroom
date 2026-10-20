import { useQuery } from '@tanstack/react-query'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { useDataSource } from '../../data/useDataSource.ts'
import { membersQuery } from '../documents/queries.ts'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { meQuery } from '../editor/meQuery.ts'
import { MemberList } from './MemberList.tsx'
import { MembersFailure } from './MembersFailure.tsx'
import { MembersSkeleton } from './MembersSkeleton.tsx'
import layout from '../documents/ListLayout.module.css'

/**
 * The screen of `/members`: who belongs to the workspace and as what. The headline is outside everything that loads, so
 * the focus that navigation puts on it has somewhere to stay. Only owners can change anything.
 */
export function MembersScreen() {
  return (
    <div className={layout.screen}>
      <PageTitle titleId="nav.members" />
      <WorkspaceGate loading={<MembersSkeleton />}>{(id) => <Members workspaceId={id} />}</WorkspaceGate>
    </div>
  )
}

function Members({ workspaceId }: { workspaceId: string }) {
  const dataSource = useDataSource()
  const members = useQuery(membersQuery(dataSource, workspaceId))
  const me = useQuery(meQuery(dataSource))

  if (members.isError || me.isError) {
    return (
      <MembersFailure
        onRetry={() => {
          void members.refetch()
          void me.refetch()
        }}
        retrying={members.isFetching || me.isFetching}
      />
    )
  }
  if (members.data === undefined || me.data === undefined) return <MembersSkeleton />
  return <MemberList workspaceId={workspaceId} members={members.data.items} meId={me.data.id} />
}
