import type { Schema } from '@draftroom/contract'
import type { KeyboardEvent, Ref } from 'react'
import { focusRow } from '../documents/useFocusFirstArrival.ts'
import { TrashRow } from './TrashRow.tsx'
import styles from './Trash.module.css'

export interface TrashListProps {
  ref: Ref<HTMLUListElement>
  documents: readonly Schema<'Document'>[]
  /** The names of the folders of the workspace by id. */
  folderNames: ReadonlyMap<string, string>
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
 * a person with a keyboard gets to the panel without going through every row; the arrow keys, Home and End select the
 * row they move to, and Enter or Space select the row that has the focus (it is a button).
 */
export function TrashList({ ref, documents, folderNames, selectedIndex, onSelect }: TrashListProps) {
  const move = (event: KeyboardEvent<HTMLUListElement>) => {
    const target = indexAfter(event.key, selectedIndex, documents.length)
    const document = target === undefined ? undefined : documents[target]
    if (target === undefined || document === undefined) return
    event.preventDefault()
    onSelect(document)
    focusRow(event.currentTarget, target, 'button')
  }

  return (
    // The keys are handled where they bubble to: the focus is always on one of the buttons inside.
    <ul ref={ref} className={styles.list} onKeyDown={move}>
      {documents.map((document, index) => (
        <li key={document.id} className={styles.item}>
          <TrashRow
            document={document}
            folderName={document.folderId === null ? null : (folderNames.get(document.folderId) ?? null)}
            selected={index === selectedIndex}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  )
}
