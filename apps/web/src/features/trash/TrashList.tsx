import type { Schema } from '@draftroom/contract'
import type { FocusEvent, KeyboardEvent, Ref } from 'react'
import { focusRow } from '../documents/useFocusFirstArrival.ts'
import { TrashRow } from './TrashRow.tsx'
import styles from './Trash.module.css'

export interface TrashListProps {
  ref: Ref<HTMLUListElement>
  documents: readonly Schema<'Document'>[]
  folderNameOf: (document: Schema<'Document'>) => string | null
  selectedIndex: number
  onSelect: (document: Schema<'Document'>) => void
}

/** The row an arrow key goes to from `index`, or `undefined` when the key is not one that moves. */
function indexAfter(key: string, index: number, count: number) {
  if (key === 'ArrowDown') return Math.min(index + 1, count - 1)
  if (key === 'ArrowUp') return Math.max(index - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return undefined
}

/**
 * The archived documents, one of them selected. The list is a single stop of the tab order, on the selected row, so that
 * a person with a keyboard gets to the panel without going through every row. The arrow keys, Home and End move the
 * focus, and the row that gets the focus is the selected one; a click selects too, for the browsers that do not focus a
 * button when it is clicked.
 */
export function TrashList({ ref, documents, folderNameOf, selectedIndex, onSelect }: TrashListProps) {
  const move = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = indexAfter(event.key, selectedIndex, documents.length)
    if (target === undefined) return
    event.preventDefault()
    // The row that gets the focus is selected by `select` below.
    focusRow(event.currentTarget, target, 'button')
  }

  // Whatever puts the focus on a row selects it, such as the first row of a page that has just arrived, so that the arrow
  // keys start from where the focus is.
  const select = (event: FocusEvent<HTMLUListElement>) => {
    const index = [...event.currentTarget.children].findIndex((item) => item.contains(event.target))
    const document = documents[index]
    if (document !== undefined && index !== selectedIndex) onSelect(document)
  }

  return (
    // The keys are handled where they bubble to: the focus is always on one of the buttons inside.
    <ul ref={ref} className={styles.list} onKeyDown={move} onFocus={select}>
      {documents.map((document, index) => (
        <li key={document.id} className={styles.item}>
          <TrashRow
            document={document}
            folderName={folderNameOf(document)}
            selected={index === selectedIndex}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  )
}
