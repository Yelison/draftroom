import { useQuery } from '@tanstack/react-query'
import { useDataSource } from '../../data/useDataSource.ts'
import { workspaceQuery } from '../settings/queries.ts'
import styles from './Home.module.css'

/**
 * The name of the workspace under the headline. Its line is there before the name is, and stays empty if the name cannot
 * be read: the page does not depend on it.
 */
export function WorkspaceName({ workspaceId }: { workspaceId: string }) {
  const { data } = useQuery(workspaceQuery(useDataSource(), workspaceId))

  return <p className={styles.workspaceName}>{data?.name}</p>
}
