import { keepMatchInView } from './keepMatchInView.ts'
import { splitByTerm } from './splitByTerm.ts'
import styles from './Highlighted.module.css'

export interface HighlightedProps {
  text: string
  term: string
  /** For a text that is shown on one line and cut at its end: how much may come before the first match. */
  lead?: number
}

/** A text of a person with what the search matched in `<mark>`. It is rendered as text, never as markup. */
export function Highlighted({ text, term, lead }: HighlightedProps) {
  const chunks = splitByTerm(text, term)
  const shown = lead === undefined ? chunks : keepMatchInView(chunks, lead)
  return shown.map((chunk, index) =>
    chunk.match ? (
      <mark key={index} className={styles.match}>
        {chunk.text}
      </mark>
    ) : (
      chunk.text
    ),
  )
}
