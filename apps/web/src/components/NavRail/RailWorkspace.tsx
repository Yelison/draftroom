import { useQuery } from '@tanstack/react-query'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { useWorkspaceId } from '../../features/documents/useWorkspaceId.ts'
import { workspaceQuery } from '../../features/settings/queries.ts'
import styles from './NavRail.module.css'

/**
 * The mark of the workspace at the top of the rail, with its name and the role the person has in it. The place is there
 * before the workspace is, and stays empty for a person who belongs to none, so the items under it never move.
 */
export function RailWorkspace() {
  const workspaceId = useWorkspaceId().data
  return (
    <div className={styles.identity}>{workspaceId !== undefined && <WorkspaceMark workspaceId={workspaceId} />}</div>
  )
}

function WorkspaceMark({ workspaceId }: { workspaceId: string }) {
  const intl = useIntl()
  const workspace = useQuery(workspaceQuery(useDataSource(), workspaceId)).data
  if (workspace === undefined) return null

  // The name and the role are always in the page: a compact rail hides them from the eye and leaves them to the title
  // and to a screen reader, which is also what keeps the mark recognisable there.
  return (
    <div className={styles.workspace} title={workspace.name}>
      <span className={styles.mark} aria-hidden="true">
        {[...workspace.name.trim()][0]?.toUpperCase()}
      </span>
      <span className={styles.names}>
        <strong className={styles.workspaceName}>{workspace.name}</strong>
        <span className={styles.role}>{intl.formatMessage({ id: `members.role.${workspace.role}` })}</span>
      </span>
    </div>
  )
}
