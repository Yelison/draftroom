import { useState } from 'react'

/**
 * Which sections of the Documents screen are folded. It lives above the search, so a person who searches and clears the
 * field finds the sections as they left them. Everything is open until the person folds it.
 */
export function useSectionFolds() {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())

  return {
    isExpanded: (sectionKey: string) => !folded.has(sectionKey),
    toggle: (sectionKey: string) =>
      setFolded((current) => {
        const next = new Set(current)
        if (!next.delete(sectionKey)) next.add(sectionKey)
        return next
      }),
  }
}

export type SectionFolds = ReturnType<typeof useSectionFolds>
