import type { Schema } from '@draftroom/contract'
import { useEffect, useId, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { AddPerson } from './AddPerson.tsx'
import { GeneralAccess } from './GeneralAccess.tsx'
import { PeopleList } from './PeopleList.tsx'
import { sharingProblemId } from './sharingProblem.ts'
import { useAccessChanges, type AccessChange } from './useAccessChanges.ts'
import styles from './Sharing.module.css'

export interface AccessEditorProps {
  document: Schema<'Document'>
  access: Schema<'AccessList'>
  members: readonly Schema<'Member'>[]
  meId: string | undefined
  /** Says something in the live region of the dialog, which is above this editor and outlives it. */
  announce: (text: string) => void
}

/**
 * Who has access to the document and how: the people with a role, the people who can still be added, and how the whole
 * workspace can open it. Each change is said in the live region of the dialog, and
 * each refusal in an alert, in the words of its `code`.
 */
export function AccessEditor({ document, access, members, meId, announce }: AccessEditorProps) {
  const intl = useIntl()
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { people: useId(), add: useId(), general: useId() }
  const picker = useRef<HTMLSelectElement>(null)
  const people = useRef<HTMLDivElement>(null)
  // Where the focus goes once the list shows the change: the row or the button that was used may be gone by then.
  const focusAfterRefresh = useRef<'picker' | 'people' | null>(null)

  const say = (change: AccessChange) => {
    setProblem(null)
    announce(textOf(change))
    if (change.kind === 'added') focusAfterRefresh.current = 'picker'
    if (change.kind === 'removed') focusAfterRefresh.current = 'people'
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
    onFailed: (error) => {
      announce('')
      setProblem(intl.formatMessage({ id: sharingProblemId(error) }))
    },
  })

  useEffect(() => {
    const target = focusAfterRefresh.current
    if (target === null) return
    focusAfterRefresh.current = null
    // With everyone already in, there is no picker to land on: the list is where the person was working.
    const landing =
      target === 'picker' && picker.current !== null ? picker.current : people.current?.querySelector('select')
    landing?.focus()
  }, [access, members])

  const granted = new Set(access.items.map((entry) => entry.userId))
  const candidates = members.filter((member) => member.status === 'active' && !granted.has(member.userId))

  return (
    <div className={styles.content}>
      {problem !== null && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <section className={styles.section} aria-labelledby={ids.people}>
        <h3 id={ids.people} className={styles.heading}>
          {intl.formatMessage({ id: 'sharing.people.heading' })}
        </h3>
        <div ref={people}>
          <PeopleList
            entries={access.items}
            meId={meId}
            busy={changes.busy}
            onRole={(entry, role) =>
              changes.setRole({ userId: entry.userId, role, name: entry.name ?? entry.email, kind: 'changed' })
            }
            onRemove={(entry) => changes.remove({ userId: entry.userId, name: entry.name ?? entry.email })}
          />
        </div>
      </section>
      <section className={styles.section} aria-labelledby={ids.add}>
        <h3 id={ids.add} className={styles.heading}>
          {intl.formatMessage({ id: 'sharing.add.heading' })}
        </h3>
        <AddPerson
          candidates={candidates}
          busy={changes.busy}
          pickerRef={picker}
          onAdd={(member, role) =>
            changes.setRole({ userId: member.userId, role, name: member.name ?? member.email, kind: 'added' })
          }
        />
      </section>
      <section className={styles.section} aria-labelledby={ids.general}>
        <h3 id={ids.general} className={styles.heading}>
          {intl.formatMessage({ id: 'sharing.general.heading' })}
        </h3>
        <GeneralAccess
          value={access.generalAccess}
          busy={changes.busy}
          onChange={(value) => changes.setGeneral(value)}
        />
      </section>
    </div>
  )
}
