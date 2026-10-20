import type { Schema } from '@draftroom/contract'
import { useId, useState } from 'react'
import { useIntl } from 'react-intl'
import { generalRowId, sameRow, type RowProblem } from './accessRow.ts'
import { AccessList } from './AccessList.tsx'
import { AddPerson } from './AddPerson.tsx'
import { sharingProblemId } from './sharingProblem.ts'
import { useAccessChanges, type AccessChange } from './useAccessChanges.ts'
import { useFocusAfterChange } from './useFocusAfterChange.ts'
import styles from './Sharing.module.css'

export interface AccessEditorProps {
  document: Schema<'Document'>
  access: Schema<'AccessList'>
  members: readonly Schema<'Member'>[]
  workspaceName: string
  meId: string | undefined
  /** Says something in the live region of the dialog, which is above this editor and outlives it. */
  announce: (text: string) => void
}

/**
 * Who has access to the document and how: the people who can still be added, and one list of who has what, which ends
 * with how the whole workspace can open it. Each change is said in the live region of the dialog, and each refusal in an
 * alert on the row it came from, in the words of its `code`.
 */
export function AccessEditor({ document, access, members, workspaceName, meId, announce }: AccessEditorProps) {
  const intl = useIntl()
  const [problem, setProblem] = useState<RowProblem | null>(null)
  const ids = { add: useId(), people: useId() }
  const focus = useFocusAfterChange([...access.items.map((entry) => entry.userId), generalRowId])

  const say = (change: AccessChange) => {
    setProblem(null)
    announce(textOf(change))
  }

  const textOf = (change: AccessChange) => {
    switch (change.kind) {
      case 'added':
        return intl.formatMessage({ id: 'sharing.announce.added' }, { name: change.name, role: change.role })
      case 'changed':
        return intl.formatMessage({ id: 'sharing.announce.changed' }, { name: change.name, role: change.role })
      case 'removed':
        return intl.formatMessage({ id: 'sharing.announce.removed' }, { name: change.name })
      case 'general':
        return intl.formatMessage({ id: 'sharing.announce.general' }, { access: change.access })
    }
  }

  const changes = useAccessChanges({
    document,
    onDone: say,
    onFailed: (error, row) => {
      focus.cancel()
      announce('')
      setProblem({ row, message: intl.formatMessage({ id: sharingProblemId(error) }) })
    },
  })

  const granted = new Set(access.items.map((entry) => entry.userId))
  const candidates = members.filter((member) => member.status === 'active' && !granted.has(member.userId))

  return (
    <div className={styles.content}>
      <section className={styles.section} aria-labelledby={ids.add}>
        <h3 id={ids.add} className={styles.heading}>
          {intl.formatMessage({ id: 'sharing.add.heading' })}
        </h3>
        <AddPerson
          candidates={candidates}
          busy={changes.pending !== null}
          problem={problem !== null && sameRow(problem.row, { kind: 'add' }) ? problem.message : null}
          pickerRef={focus.picker}
          onAdd={(member, role) => {
            focus.willAdd(member.userId)
            changes.setRole({ userId: member.userId, role, name: member.name ?? member.email, kind: 'added' })
          }}
        />
      </section>
      <section className={styles.section} aria-labelledby={ids.people}>
        <h3 id={ids.people} className={styles.heading}>
          {intl.formatMessage({ id: 'sharing.people.heading' })}
        </h3>
        <AccessList
          entries={access.items}
          generalAccess={access.generalAccess}
          workspaceName={workspaceName}
          meId={meId}
          pending={changes.pending}
          problem={problem}
          listRef={focus.list}
          onRole={(entry, role) =>
            changes.setRole({ userId: entry.userId, role, name: entry.name ?? entry.email, kind: 'changed' })
          }
          onRemove={(entry) => {
            focus.willRemove(entry.userId)
            changes.remove({ userId: entry.userId, name: entry.name ?? entry.email })
          }}
          onGeneralAccess={(value) => changes.setGeneral(value)}
        />
      </section>
    </div>
  )
}
