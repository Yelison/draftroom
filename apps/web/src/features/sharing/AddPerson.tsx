import type { Schema } from '@draftroom/contract'
import { Button, Select } from '@yelison/forma-ui'
import { useId, useState, type Ref } from 'react'
import { useIntl } from 'react-intl'
import { permissionLabelId } from '../../components/Permission/Permission.tsx'
import { documentRoles, isDocumentRole } from './roles.ts'
import styles from './Sharing.module.css'

type Member = Schema<'Member'>

export interface AddPersonProps {
  /** The people of the workspace who can still be given a role: active, and without one. */
  candidates: readonly Member[]
  busy: boolean
  /** Why the last attempt to add somebody was refused, for the row to say and the controls to be described by. */
  problem: string | null
  onAdd: (member: Member, role: Schema<'DocumentRole'>) => void
  /** The person picker, for the focus to return to after somebody is added. */
  pickerRef: Ref<HTMLSelectElement>
}

/** Gives a role to someone of the workspace. Nobody outside it can be chosen: the contract does not let a document leave it. */
export function AddPerson({ candidates, busy, problem, onAdd, pickerRef }: AddPersonProps) {
  const intl = useIntl()
  const problemId = useId()
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Schema<'DocumentRole'>>('viewer')
  const chosen = candidates.find((member) => member.userId === userId)
  // Once the chosen person has a role they are no longer a candidate: the choice is over, and must not come back if they
  // are removed later. Adjusted while rendering, so that no effect has to set state.
  if (userId !== '' && chosen === undefined) setUserId('')

  if (candidates.length === 0) {
    return (
      <div className={styles.addEmpty}>
        <p className={styles.note}>{intl.formatMessage({ id: 'sharing.add.everyone' })}</p>
      </div>
    )
  }

  const described = problem === null ? undefined : problemId

  return (
    <form
      className={styles.add}
      onSubmit={(event) => {
        event.preventDefault()
        if (chosen === undefined || busy) return
        // The choice stays until the person is in the list: a refusal leaves it as it was, ready to try again.
        onAdd(chosen, role)
      }}
    >
      <Select
        ref={pickerRef}
        label={intl.formatMessage({ id: 'sharing.add.person' })}
        value={chosen === undefined ? '' : chosen.userId}
        aria-describedby={described}
        onChange={(event) => setUserId(event.target.value)}
      >
        <option value="">{intl.formatMessage({ id: 'sharing.add.choose' })}</option>
        {candidates.map((member) => (
          <option key={member.userId} value={member.userId}>
            {member.name ?? member.email}
          </option>
        ))}
      </Select>
      <Select
        label={intl.formatMessage({ id: 'sharing.add.role' })}
        value={role}
        onChange={(event) => {
          if (isDocumentRole(event.target.value)) setRole(event.target.value)
        }}
      >
        {documentRoles.map((value) => (
          <option key={value} value={value}>
            {intl.formatMessage({ id: permissionLabelId(value) })}
          </option>
        ))}
      </Select>
      <Button type="submit" aria-disabled={chosen === undefined || busy || undefined} aria-describedby={described}>
        {intl.formatMessage({ id: 'sharing.add.action' })}
      </Button>
      {problem !== null && (
        <p id={problemId} role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
    </form>
  )
}
