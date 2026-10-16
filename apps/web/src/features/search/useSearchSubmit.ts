import type { KeyboardEvent } from 'react'
import { createSearchParams, useLocation, useNavigate } from 'react-router'
import { searchTerm } from '../documents/searchTerm.ts'

/**
 * The key handler that turns a search field into a way to `/search`: Enter opens the results of what is typed. A field
 * with nothing in it (or only spaces) does nothing, and so does the Enter that confirms a composition in an input method.
 */
export function useSearchSubmit(text: string) {
  const navigate = useNavigate()
  const location = useLocation()

  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    const term = searchTerm(text)
    if (term === undefined) return
    const search = `?${createSearchParams({ q: term })}`
    // The same search again is not a new place: Back must leave the results, not land on them once more.
    const here = location.pathname === '/search' && location.search === search
    void navigate({ pathname: '/search', search }, { replace: here })
  }
}
