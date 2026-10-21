import { contractLimits } from '@draftroom/contract'
import { Input } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { problemMessageId } from '../documents/problemMessage.ts'
import type { SettingsForm } from './useSettingsForm.ts'
import styles from './Settings.module.css'

/** The name of the workspace, which only its owners can change: anyone else reads it, with the reason. */
export function WorkspaceSection({ form }: { form: SettingsForm }) {
  const intl = useIntl()
  const { problems, failures } = form
  const error =
    problems.workspaceName !== null
      ? intl.formatMessage(
          { id: `settings.workspace.name.${problems.workspaceName}` },
          { max: contractLimits.workspaceName.max },
        )
      : failures.workspaceName !== null
        ? intl.formatMessage({ id: problemMessageId(failures.workspaceName) })
        : undefined

  return (
    <section id="settings-workspace" className={styles.section} aria-labelledby="settings-workspace-heading">
      <h2 id="settings-workspace-heading" className={styles.heading}>
        {intl.formatMessage({ id: 'settings.workspace.title' })}
      </h2>
      <Input
        label={intl.formatMessage({ id: 'settings.workspace.name.label' })}
        value={form.workspaceName}
        readOnly={!form.canRename}
        onChange={(event) => form.setWorkspaceName(event.target.value)}
        hint={
          form.canRename || !form.workspaceKnown
            ? undefined
            : intl.formatMessage({ id: 'settings.workspace.ownersOnly' })
        }
        error={error}
      />
    </section>
  )
}
