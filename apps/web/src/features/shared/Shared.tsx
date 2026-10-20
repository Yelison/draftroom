import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { QueryFailure } from '../documents/QueryFailure.tsx'
import { StateMessage } from '../documents/StateMessage.tsx'
import { groupByRole } from './groupByRole.ts'
import { SharedSection } from './SharedSection.tsx'
import { SharedSkeleton } from './SharedSkeleton.tsx'
import { sharedListQuery } from './sharedQuery.ts'
import styles from './Shared.module.css'

/** The documents shared with the person, in a block for each permission they have. */
export function Shared({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const query = useQuery(sharedListQuery(useDataSource(), workspaceId))

  if (query.isPending) return <SharedSkeleton />
  if (query.isError) return <QueryFailure onRetry={() => void query.refetch()} retrying={query.isFetching} />

  const groups = groupByRole(query.data.items)
  if (groups.length === 0) return <StateMessage title={intl.formatMessage({ id: 'shared.empty' })} />

  return (
    <div className={styles.sections}>
      {groups.map((group) => (
        <SharedSection key={group.role} group={group} />
      ))}
    </div>
  )
}
