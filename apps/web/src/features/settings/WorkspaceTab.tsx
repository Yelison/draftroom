import { contractLimits, type Schema } from '@draftroom/contract'
import { useQuery } from '@tanstack/react-query'
import { Button, Input } from '@yelison/forma-ui'
import { useState, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { useDataSource } from '../../data/useDataSource.ts'
import { textProblem, type TextProblem } from '../documents/actions/textProblem.ts'
import { WorkspaceGate } from '../documents/WorkspaceGate.tsx'
import { FormStatus } from './FormStatus.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { SettingsSkeleton } from './SettingsSkeleton.tsx'
import { workspaceQuery } from './queries.ts'
import { useRenameWorkspace } from './useRenameWorkspace.ts'
import styles from './Settings.module.css'

/** The name of the workspace, which only its owners can change. */
export function WorkspaceTab() {
  return (
    <WorkspaceGate loading={<SettingsSkeleton fields={1} />}>{(id) => <Workspace workspaceId={id} />}</WorkspaceGate>
  )
}

function Workspace({ workspaceId }: { workspaceId: string }) {
  const dataSource = useDataSource()
  const workspace = useQuery(workspaceQuery(dataSource, workspaceId))

  if (workspace.isError)
    return <SettingsFailure onRetry={() => void workspace.refetch()} retrying={workspace.isFetching} />
  if (workspace.data === undefined) return <SettingsSkeleton fields={1} />
  return <WorkspaceForm workspace={workspace.data} />
}

function WorkspaceForm({ workspace }: { workspace: Schema<'Workspace'> }) {
  const intl = useIntl()
  const rename = useRenameWorkspace(workspace.id)
  const [name, setName] = useState(workspace.name)
  const [problem, setProblem] = useState<TextProblem | null>(null)
  const owner = workspace.role === 'owner'
  const changed = name.trim() !== workspace.name

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (rename.isPending || !changed) return
    const found = textProblem(name, contractLimits.workspaceName)
    setProblem(found)
    if (found === null) rename.mutate(name.trim())
  }

  return (
    <section className={styles.panel} aria-labelledby="settings-workspace-heading">
      <div>
        <h2 id="settings-workspace-heading" className={styles.heading}>
          {intl.formatMessage({ id: 'settings.workspace.title' })}
        </h2>
        <p className={styles.description}>{intl.formatMessage({ id: 'settings.workspace.description' })}</p>
      </div>
      <form className={styles.form} onSubmit={save} noValidate>
        <Input
          label={intl.formatMessage({ id: 'settings.workspace.name.label' })}
          value={name}
          readOnly={!owner}
          onChange={(event) => setName(event.target.value)}
          hint={owner ? undefined : intl.formatMessage({ id: 'settings.workspace.ownersOnly' })}
          error={
            problem === null
              ? undefined
              : intl.formatMessage(
                  { id: `settings.workspace.name.${problem}` },
                  { max: contractLimits.workspaceName.max },
                )
          }
        />
        {owner && (
          <>
            <Button type="submit" loading={rename.isPending} aria-disabled={!changed || undefined}>
              {intl.formatMessage({ id: 'settings.save' })}
            </Button>
            <FormStatus saved={rename.isSuccess && !changed ? 'settings.saved' : null} failure={rename.error} />
          </>
        )}
      </form>
    </section>
  )
}
