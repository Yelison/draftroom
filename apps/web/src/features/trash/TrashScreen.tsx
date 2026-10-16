import { useIntl } from 'react-intl'
import { PageTitle } from '../../components/PageTitle/PageTitle.tsx'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import layout from '../documents/ListLayout.module.css'
import { Trash } from './Trash.tsx'
import { TrashSkeleton } from './TrashSkeleton.tsx'
import styles from './Trash.module.css'

/**
 * The screen of `/trash`: the archived documents the person owns. The headline is outside everything that loads, so the
 * focus that navigation puts on it has somewhere to stay.
 */
export function TrashScreen() {
  const intl = useIntl()

  return (
    <div className={layout.screen}>
      <PageTitle titleId="screen.trash" />
      <p className={styles.description}>{intl.formatMessage({ id: 'trash.description' })}</p>
      <WorkspaceGate loading={<TrashSkeleton />}>{(workspaceId) => <Trash workspaceId={workspaceId} />}</WorkspaceGate>
    </div>
  )
}
