import type { Schema } from '@draftroom/contract'
import { Icon, Select } from '@yelison/forma-ui'
import { useId } from 'react'
import { useIntl } from 'react-intl'
import type { MessageId } from '../../i18n/messages.ts'
import { generalRowId } from './useFocusAfterChange.ts'
import { generalAccesses, isGeneralAccess } from './roles.ts'
import styles from './Sharing.module.css'

export const generalAccessLabelId = (access: Schema<'GeneralAccess'>): MessageId => `sharing.general.${access}`

export interface GeneralAccessRowProps {
  value: Schema<'GeneralAccess'>
  workspaceName: string
  /** A change is on its way, in this row or another. */
  busy: boolean
  saving: boolean
  problem: string | null
  onChange: (access: Schema<'GeneralAccess'>) => void
}

/** How the whole workspace can open the document, on top of the roles given one by one: the last row of the list. */
export function GeneralAccessRow({ value, workspaceName, busy, saving, problem, onChange }: GeneralAccessRowProps) {
  const intl = useIntl()
  const problemId = useId()

  return (
    <li className={`${styles.row} ${styles.everyone}`} data-row={generalRowId} aria-busy={saving || undefined}>
      <span className={styles.everyoneMark}>
        <Icon name="team" size={20} />
      </span>
      <span className={styles.identity}>
        <span className={styles.name}>
          {intl.formatMessage({ id: 'sharing.general.everyone' }, { workspace: workspaceName })}
        </span>
        <span className={styles.caption}>{intl.formatMessage({ id: 'sharing.general.caption' })}</span>
      </span>
      <div className={styles.everyoneControl}>
        <Select
          label={
            <span className="forma-visually-hidden">
              {intl.formatMessage({ id: 'sharing.general.label' }, { workspace: workspaceName })}
            </span>
          }
          value={value}
          aria-disabled={busy || undefined}
          aria-describedby={problem === null ? undefined : problemId}
          onChange={(event) => {
            const access = event.target.value
            if (!busy && isGeneralAccess(access)) onChange(access)
          }}
        >
          {generalAccesses.map((access) => (
            <option key={access} value={access}>
              {intl.formatMessage({ id: generalAccessLabelId(access) })}
            </option>
          ))}
        </Select>
      </div>
      {problem !== null && (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
    </li>
  )
}
