import { Button, Dialog } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { AppearanceSection } from './AppearanceSection.tsx'
import { ProfileSection } from './ProfileSection.tsx'
import { SettingsFailure } from './SettingsFailure.tsx'
import { WorkspaceSection } from './WorkspaceSection.tsx'
import { FormStatus } from './FormStatus.tsx'
import type { SettingsSection } from './useSettingsDialog.ts'
import { useSettingsData } from './useSettingsData.ts'
import { useSettingsForm } from './useSettingsForm.ts'
import styles from './Settings.module.css'

const formId = 'settings-form'

export interface SettingsDialogProps {
  /** Where the dialog opens: the first control of that section takes the focus, which also brings it into view. */
  section: SettingsSection
  onClose: () => void
}

/**
 * Settings, in one column: the profile, the appearance and the workspace of the person, over the page they were on. The
 * dialog is one element from the first paint to the last, whatever it has to show (the sections, a failure), so the focus
 * the browser keeps for it is never moved by the data arriving. While the data is on its way the sections are the real
 * ones, empty and inert, which measure what the loaded ones measure by construction: nothing moves when it arrives.
 * Appearance keeps what is chosen as it is chosen; the text fields are kept together by Save changes, which says nothing
 * is saved until the server has said so. The headline and the buttons stay in sight and only the sections scroll.
 */
export function SettingsDialog({ section, onClose }: SettingsDialogProps) {
  const intl = useIntl()
  const data = useSettingsData()
  const ready = data.status === 'ready'
  const form = useSettingsForm(ready ? data.me : undefined, ready ? data.workspace : undefined)
  const body = useRef<HTMLDivElement>(null)

  // The browser puts the focus on the first thing that can take it, which is the scrolling column while the fields are
  // inert. Once they are there it goes to the first control of the section the address names (the name, by default),
  // unless the person has already moved it while the data was on its way.
  useEffect(() => {
    const active = document.activeElement
    const where = body.current
    const untouched =
      active === null || active === document.body || active === where || active === where?.closest('dialog')
    if (ready && untouched) where?.querySelector<HTMLElement>(`#settings-${section} :is(input, button)`)?.focus()
  }, [ready, section])

  return (
    <Dialog
      open
      size="wide"
      className={styles.dialog ?? ''}
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
        {data.status === 'failed' && <SettingsFailure onRetry={data.retry} retrying={data.retrying} />}
        {data.status !== 'failed' && (
          <form
            id={formId}
            className={styles.form}
            onSubmit={form.save}
            noValidate
            inert={!ready}
            aria-busy={!ready || undefined}
          >
            <ProfileSection email={ready ? data.me.email : ''} form={form} />
            <AppearanceSection textSize={ready ? data.me.editorTextSize : 'medium'} />
            {(!ready || data.workspace !== null) && <WorkspaceSection form={form} />}
            <FormStatus saved={form.saved ? 'settings.saved' : null} />
          </form>
        )}
        {data.status === 'loading' && (
          <p role="status" className="forma-visually-hidden">
            {intl.formatMessage({ id: 'settings.loading' })}
          </p>
        )}
      </div>
    </Dialog>
  )
}
