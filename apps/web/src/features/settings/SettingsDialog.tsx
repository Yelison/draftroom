import { Button, Dialog } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { AppearanceSection } from './AppearanceSection.tsx'
import { ProfileSection } from './ProfileSection.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { SettingsSkeleton } from './SettingsSkeleton.tsx'
import { WorkspaceSection } from './WorkspaceSection.tsx'
import { FormStatus } from './FormStatus.tsx'
import type { SettingsSection } from './useSettingsDialog.ts'
import { useSettingsData } from './useSettingsData.ts'
import { useSettingsForm } from './useSettingsForm.ts'
import styles from './Settings.module.css'

const formId = 'settings-form'

export interface SettingsDialogProps {
  /** Where the dialog opens: the first control of that section takes the focus. */
  section: SettingsSection
  onClose: () => void
}

/**
 * Settings, in one column: the profile, the appearance and the workspace of the person, over the page they were on. The
 * dialog is one element from the first paint to the last, whatever it has to show (a skeleton, a failure, the sections),
 * so the focus the browser keeps for it is never moved by the data arriving. Appearance keeps what is chosen as it is
 * chosen; the text fields are kept together by Save changes, which says nothing is saved until the server has said so.
 */
export function SettingsDialog({ section, onClose }: SettingsDialogProps) {
  const intl = useIntl()
  const data = useSettingsData()
  const ready = data.status === 'ready'
  const form = useSettingsForm(ready ? data.me : undefined, ready ? data.workspace : undefined)
  const body = useRef<HTMLDivElement>(null)

  // The first stop of the dialog is its close button. An address that names a section is a person asking for it, so
  // the focus goes there, which also brings it into view.
  useEffect(() => {
    if (ready && section !== 'profile')
      body.current?.querySelector<HTMLElement>(`#settings-${section} :is(input, button)`)?.focus()
  }, [ready, section])

  return (
    <Dialog
      open
      size="wide"
      onClose={onClose}
      title={intl.formatMessage({ id: 'settings.dialog.title' })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {intl.formatMessage({ id: 'settings.done' })}
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={form.pending}
            aria-disabled={!ready || !form.changed || undefined}
          >
            {intl.formatMessage({ id: 'settings.save' })}
          </Button>
        </>
      }
    >
      <div ref={body} className={styles.body}>
        {data.status === 'loading' && <SettingsSkeleton />}
        {data.status === 'failed' && <SettingsFailure onRetry={data.retry} retrying={data.retrying} />}
        {data.status === 'ready' && (
          <form id={formId} className={styles.form} onSubmit={form.save} noValidate>
            <ProfileSection me={data.me} form={form} />
            <AppearanceSection textSize={data.me.editorTextSize} />
            {data.workspace !== null && <WorkspaceSection form={form} />}
            <FormStatus saved={form.saved ? 'settings.saved' : null} />
          </form>
        )}
      </div>
    </Dialog>
  )
}
