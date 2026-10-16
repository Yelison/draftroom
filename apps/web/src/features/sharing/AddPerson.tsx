import type { Schema } from '@draftroom/contract'
import { Button, Select } from '@yelison/forma-ui'
import { useState, type Ref } from 'react'
import { useIntl } from 'react-intl'
import { permissionLabelId } from '../../components/Permission/Permission.tsx'
import { documentRoles, isDocumentRole } from './roles.ts'
import styles from './Sharing.module.css'

type Member = Schema<'Member'>

export interface AddPersonProps {
  /** The people of the workspace who can still be given a role: active, and without one. */
  candidates: readonly Member[]
  busy: boolean
  onAdd: (member: Member, role: Schema<'DocumentRole'>) => void
  /** The person picker, for the focus to return to after somebody is added. */
  pickerRef: Ref<HTMLSelectElement>
}

/** Gives a role to someone of the workspace. Nobody outside it can be chosen: the contract does not let a document leave it. */
export function AddPerson({ candidates, busy, onAdd, pickerRef }: AddPersonProps) {
  const intl = useIntl()
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<Schema<'DocumentRole'>>('viewer')
  const chosen = candidates.find((member) => member.userId === userId)

  if (candidates.length === 0) {
    return <p className={styles.note}>{intl.formatMessage({ id: 'sharing.add.everyone' })}</p>
  }

  return (
    <form
      className={styles.add}
      onSubmit={(event) => {
        event.preventDefault()
        if (chosen === undefined || busy) return
        onAdd(chosen, role)
        setUserId('')
      }}
    >
      <Select
        ref={pickerRef}
        label={intl.formatMessage({ id: 'sharing.add.person' })}
        value={chosen === undefined ? '' : chosen.userId}
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
      <Button type="submit" aria-disabled={chosen === undefined || busy || undefined}>
        {intl.formatMessage({ id: 'sharing.add.action' })}
      </Button>
    </form>
  )
}
