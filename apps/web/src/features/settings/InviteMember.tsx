import type { Schema } from '@draftroom/contract'
import { Button, Input, Select } from '@yelison/forma-ui'
import { useState, type Ref, type SubmitEvent } from 'react'
import { useIntl } from 'react-intl'
import { isApiError } from '../../data/errors.ts'
import { isWorkspaceRole, workspaceRoles } from './workspaceRoles.ts'
import styles from './Members.module.css'

/** What is wrong with an address before it is sent. The server has the last word on what an address is. */
type EmailProblem = 'required' | 'invalid' | 'tooLong'

/** The longest address the contract takes (`Email`), in Unicode code points. */
const emailMaxLength = 254

const addressShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function emailProblem(email: string): EmailProblem | null {
  const length = [...email].length
  if (length === 0) return 'required'
  if (length > emailMaxLength) return 'tooLong'
  return addressShape.test(email) ? null : 'invalid'
}

export interface InviteMemberProps {
  busy: boolean
  /** The refusal of the last invitation, to show at the address when the server says the address is not valid. */
  failure: Error | null
  /** Sends the invitation; `onSuccess` runs when the server has taken it, and the address stays until then. */
  onInvite: (invitation: Schema<'AddMemberRequest'>, options: { onSuccess: () => void }) => void
  /** The address field, for the focus to return to after somebody is invited. */
  emailRef: Ref<HTMLInputElement>
}

/** Invites somebody by email with a role. A person who has no account yet is pending until they sign up. */
export function InviteMember({ busy, failure, onInvite, emailRef }: InviteMemberProps) {
  const intl = useIntl()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Schema<'WorkspaceRole'>>('member')
  const [problem, setProblem] = useState<EmailProblem | null>(null)
  const refused =
    failure !== null &&
    isApiError(failure, 'validation-failed') &&
    failure.fieldErrors.some((field) => field.pointer === '/email')
  const shown = problem ?? (refused ? 'invalid' : null)

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const address = email.trim()
    const found = emailProblem(address)
    setProblem(found)
    if (found !== null) return
    onInvite({ email: address, role }, { onSuccess: () => setEmail('') })
  }

  return (
    <form className={styles.invite} onSubmit={submit} noValidate>
      <Input
        ref={emailRef}
        type="email"
        label={intl.formatMessage({ id: 'settings.members.invite.email' })}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={
          shown === null
            ? undefined
            : intl.formatMessage({ id: `settings.members.invite.${shown}` }, { max: emailMaxLength })
        }
      />
      <Select
        label={intl.formatMessage({ id: 'settings.members.invite.role' })}
        value={role}
        onChange={(event) => {
          if (isWorkspaceRole(event.target.value)) setRole(event.target.value)
        }}
      >
        {workspaceRoles.map((value) => (
          <option key={value} value={value}>
            {intl.formatMessage({ id: `settings.members.role.${value}` })}
          </option>
        ))}
      </Select>
      <Button type="submit" aria-disabled={busy || undefined}>
        {intl.formatMessage({ id: 'settings.members.invite.action' })}
      </Button>
    </form>
  )
}
