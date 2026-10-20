import { useState } from 'react'
import { openFolderCount } from './sectionDefaults.ts'

/**
 * Which sections of the Documents screen are open. It lives above the search, so a person who searches and clears the
 * field finds the sections as they left them.
 *
 * Until the person opens or folds a section it is as the screen opens it: "Pinned" and "No folder" are open, and so are
 * the first `openFolderCount` folders, in the order they are listed. `position` is the place of a folder in that order.
 */
export function useSectionFolds() {
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map())
  const isExpanded = (sectionKey: string, position = 0) => chosen.get(sectionKey) ?? position < openFolderCount

  return {
    isExpanded,
    toggle: (sectionKey: string, position = 0) =>
      setChosen((current) =>
        new Map(current).set(sectionKey, !(current.get(sectionKey) ?? position < openFolderCount)),
      ),
  }
}

export type SectionFolds = ReturnType<typeof useSectionFolds>
