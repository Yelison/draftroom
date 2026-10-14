import { useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { useIntl } from 'react-intl'
import { DocumentRow } from '../../../components/DocumentRow/DocumentRow.tsx'
import { actionForKey, typeaheadTarget, type TreeAction } from './treeKeys.ts'
import { isBranch, recentKey, visibleItems, type TreeItem } from './treeModel.ts'
import styles from './ExplorerTree.module.css'

export interface ExplorerTreeProps {
  /** The accessible name of the tree. */
  label: string
  roots: readonly TreeItem[]
  /** The document that is open. Its rows are the selected ones; where the focus is has nothing to do with it. */
  openDocumentId: string | undefined
  onOpenDocument: (documentId: string) => void
  /** `F2` or the menu key: rename or move the document, rename the folder. */
  onChange: (item: TreeItem) => void
  /** `Delete`, offered only where the person may archive. */
  onArchive: (item: TreeItem) => void
  /** For the screen to put the focus back in the tree after a dialog closes with nothing to take it. */
  ref: Ref<ExplorerTreeHandle>
}

export interface ExplorerTreeHandle {
  /** Focuses the row that is the tab stop: where the focus was last, or the open document. */
  focusTabStop: () => void
}

/** How long a pause ends a word being typed to find an item. */
const typeaheadPause = 700

/** The keys beyond the tree's own that a row answers to, by what the person may do with it (see `onKeyDown`). */
function shortcutsOf(item: TreeItem): string | undefined {
  if (item.kind === 'recent') return undefined
  if (item.kind === 'folder') return 'F2'
  const { role } = item.document
  if (role === 'owner') return 'F2 Delete'
  return role === 'editor' ? 'F2' : undefined
}

const idOf = (treeId: string, key: string) => `${treeId}-${key}`

/**
 * The explorer's tree, with the ARIA tree pattern: one tab stop, the arrow keys, Home and End, Enter to open, and type-ahead
 * (see `actionForKey` for the table). Two things are told apart on purpose: the **selected** rows are the open document's
 * (`aria-selected`, drawn as a fill) and the **focus** is where the keyboard is (the ring), so a person can walk the tree
 * with the open document still marked, and come back to it.
 */
export function ExplorerTree({
  label,
  roots,
  openDocumentId,
  onOpenDocument,
  onChange,
  onArchive,
  ref,
}: ExplorerTreeProps) {
  const { locale } = useIntl()
  const treeId = useId()
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const typed = useRef({ text: '', timer: 0 })

  // A branch is open when the person said so, and otherwise when it is Recent or holds the document that is open.
  const defaultOpen = useMemo(() => {
    const keys = new Set([recentKey])
    for (const root of roots) {
      if (isBranch(root) && root.children.some((child) => child.document.id === openDocumentId)) keys.add(root.key)
    }
    return keys
  }, [roots, openDocumentId])
  const isExpanded = (key: string) => choices.get(key) ?? defaultOpen.has(key)

  const items = visibleItems(roots, isExpanded)
  const isOpen = (item: TreeItem) => item.kind === 'document' && item.document.id === openDocumentId
  // A document that is under Recent and under its folder is one selection, not two: Recent's row is drawn as open and
  // the row of its folder (or of the loose documents) is the one that carries `aria-selected`.
  const isSelected = (item: TreeItem) => isOpen(item) && item.parentKey !== recentKey
  // The one tab stop: where the focus was last, and while it has not been in the tree, the open document, or the first row.
  const tabStopKey = items.find((item) => item.key === focusedKey)?.key ?? items.find(isSelected)?.key ?? items[0]?.key

  const focusItem = (key: string) => {
    setFocusedKey(key)
    document.getElementById(idOf(treeId, key))?.focus()
  }
  useImperativeHandle(ref, () => ({
    focusTabStop: () => {
      if (tabStopKey !== undefined) focusItem(tabStopKey)
    },
  }))

  const toggle = (key: string, open: boolean) => setChoices((previous) => new Map(previous).set(key, open))

  function apply(action: TreeAction, item: TreeItem) {
    switch (action.type) {
      case 'focus':
        return focusItem(action.key)
      case 'expand':
        return toggle(action.key, true)
      case 'collapse':
        return toggle(action.key, false)
      case 'activate':
        if (item.kind === 'document') onOpenDocument(item.document.id)
    }
  }

  function onKeyDown(event: KeyboardEvent, item: TreeItem) {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'F2' || event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      if (item.kind !== 'recent') onChange(item)
      return
    }
    if (event.key === 'Delete') {
      if (item.kind === 'document' && item.document.role === 'owner') onArchive(item)
      return
    }
    const action = actionForKey(event.key, { items, current: item, isExpanded })
    if (action !== null) {
      event.preventDefault()
      apply(action, item)
      return
    }
    // A single printable character, not the key that opens the page's own shortcuts.
    if (event.key.length !== 1 || event.key === ' ') return
    window.clearTimeout(typed.current.timer)
    typed.current.text += event.key
    typed.current.timer = window.setTimeout(() => {
      typed.current.text = ''
    }, typeaheadPause)
    const target = typeaheadTarget(items, item, typed.current.text, locale)
    if (target !== undefined) focusItem(target.key)
  }

  function renderItems(branch: readonly TreeItem[]) {
    return branch.map((item, index) => {
      const expanded = isBranch(item) ? isExpanded(item.key) : undefined
      const groupId = idOf(treeId, `${item.key}-group`)
      return (
        <li key={item.key} role="none">
          <DocumentRow
            role="treeitem"
            id={idOf(treeId, item.key)}
            tabIndex={item.key === tabStopKey ? 0 : -1}
            aria-level={item.level}
            aria-setsize={branch.length}
            aria-posinset={index + 1}
            aria-expanded={expanded}
            aria-owns={expanded ? groupId : undefined}
            // The name of a row is its own text: the rows it owns are not part of it, as they would be in a name from content.
            aria-label={isBranch(item) ? item.label : undefined}
            aria-selected={item.kind === 'document' ? isSelected(item) : undefined}
            aria-keyshortcuts={shortcutsOf(item)}
            variant={item.kind === 'document' ? (isOpen(item) ? 'selected' : 'default') : 'folder'}
            {...(item.kind === 'recent' ? { icon: 'clock' as const } : {})}
            expanded={expanded}
            title={item.label}
            onFocus={() => setFocusedKey(item.key)}
            onKeyDown={(event) => onKeyDown(event, item)}
            onClick={() => {
              focusItem(item.key)
              if (isBranch(item)) toggle(item.key, !isExpanded(item.key))
              else onOpenDocument(item.document.id)
            }}
          />
          {isBranch(item) && expanded && (
            <ul role="group" id={groupId} className={styles.group}>
              {renderItems(item.children)}
            </ul>
          )}
        </li>
      )
    })
  }

  return (
    <ul role="tree" aria-label={label} className={styles.tree}>
      {renderItems(roots)}
    </ul>
  )
}
