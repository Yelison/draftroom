import { useRef, useState } from 'react'
import { openFolderCount } from './sectionDefaults.ts'

/** Which sections a list opens until the person chooses: the Documents screen opens the most; the explorer, only "Pinned". */
export interface InitiallyOpen {
  sections: readonly string[]
  folders: number
}

const documentsScreen: InitiallyOpen = { sections: ['pinned', 'unfiled'], folders: openFolderCount }

/**
 * Which sections of the Documents screen are open. It lives above the search, so a person who searches and clears the
 * field finds the sections as they left them.
 *
 * Until the person opens or folds a section it is as the screen opened it: "Pinned" and "No folder" are open, and so are
 * the first `openFolderCount` folders of the first list of folders that arrived (`initiallyOpen` says otherwise). That list is fixed by id, so a folder
 * created or renamed later, which may be listed ahead of the others, does not push an open folder out of the open ones
 * (and is itself folded until the person opens it).
 */
export function useSectionFolds(initiallyOpen: InitiallyOpen = documentsScreen) {
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map())
  const openedByDefault = useRef<Set<string>>(new Set(initiallyOpen.sections))
  const firstListSeen = useRef(false)
  const isExpanded = (sectionKey: string) => chosen.get(sectionKey) ?? openedByDefault.current.has(sectionKey)

  return {
    isExpanded,
    /** Fixes which folders are open by default, from the first list of folders; later lists change nothing. */
    openByDefault: (folderIds: readonly string[]) => {
      if (firstListSeen.current) return
      firstListSeen.current = true
      for (const folderId of folderIds.slice(0, initiallyOpen.folders)) openedByDefault.current.add(folderId)
    },
    toggle: (sectionKey: string) =>
      setChosen((current) =>
        new Map(current).set(sectionKey, !(current.get(sectionKey) ?? openedByDefault.current.has(sectionKey))),
      ),
  }
}

export type SectionFolds = ReturnType<typeof useSectionFolds>
