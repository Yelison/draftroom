import { SearchField } from '@yelison/forma-ui'
import { useState } from 'react'
import { useIntl } from 'react-intl'
import styles from './SearchForm.module.css'
import { useSearchSubmit } from './useSearchSubmit.ts'

export interface SearchFormProps {
  /** What the URL searches for now; `undefined` for nothing. */
  term: string | undefined
}

/**
 * The search field of the results. Its text is the person's until the URL changes under it (Back, Forward, a new
 * search): then it shows what the URL says. The field is not remounted for that, so it keeps the focus Enter left on it.
 */
export function SearchForm({ term }: SearchFormProps) {
  const intl = useIntl()
  const [text, setText] = useState(term ?? '')
  const [shownTerm, setShownTerm] = useState(term)
  if (term !== shownTerm) {
    setShownTerm(term)
    setText(term ?? '')
  }
  const submit = useSearchSubmit(text)

  return (
    <div className={styles.search}>
      <SearchField
        label={intl.formatMessage({ id: 'documents.search.label' })}
        placeholder={intl.formatMessage({ id: 'documents.search.label' })}
        value={text}
        onValueChange={setText}
        onKeyDown={submit}
      />
    </div>
  )
}
