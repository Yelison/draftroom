import type { Schema } from '@draftroom/contract'

interface ItemBase {
  /** Unique in the tree, also when the same document appears twice (in Recent and in its folder). */
  key: string
  /** What type-ahead matches and a screen reader reads. */
  label: string
  /** The depth, counted from 1 as `aria-level` does. */
  level: number
  parentKey: string | null
}

export interface DocumentItem extends ItemBase {
  kind: 'document'
  document: Schema<'Document'>
}

export interface FolderItem extends ItemBase {
  kind: 'folder'
  folder: Schema<'Folder'>
  children: readonly DocumentItem[]
}

/** The most recently changed documents, as a group of their own above the folders. */
export interface RecentItem extends ItemBase {
  kind: 'recent'
  children: readonly DocumentItem[]
}

export type TreeItem = DocumentItem | FolderItem | RecentItem
export type BranchItem = FolderItem | RecentItem

export const isBranch = (item: TreeItem): item is BranchItem => item.kind !== 'document'

export const recentKey = 'recent'
export const folderKey = (folderId: string) => `folder:${folderId}`
export const documentKey = (documentId: string) => `document:${documentId}`
const recentDocumentKey = (documentId: string) => `recent:${documentId}`

/** How many documents the Recent group shows. */
export const recentLimit = 5

export interface TreeInput {
  folders: readonly Schema<'Folder'>[]
  /** In the order the server gave them: the most recently changed first. */
  documents: readonly Schema<'Document'>[]
  /** Whether the documents are the answer to a search, which are listed flat: a folder around a hit says little. */
  searching: boolean
  recentLabel: string
}

const documentItem = (
  document: Schema<'Document'>,
  key: string,
  level: number,
  parentKey: string | null,
): DocumentItem => ({
  kind: 'document',
  key,
  label: document.title,
  level,
  parentKey,
  document,
})

/**
 * The tree the explorer shows: Recent, then the folders with their documents, then the documents that are in none. A
 * search shows its hits as a flat list instead.
 */
export function buildTree({ folders, documents, searching, recentLabel }: TreeInput): TreeItem[] {
  if (searching) return documents.map((document) => documentItem(document, documentKey(document.id), 1, null))

  const recent: RecentItem[] =
    documents.length === 0
      ? []
      : [
          {
            kind: 'recent',
            key: recentKey,
            label: recentLabel,
            level: 1,
            parentKey: null,
            children: documents
              .slice(0, recentLimit)
              .map((document) => documentItem(document, recentDocumentKey(document.id), 2, recentKey)),
          },
        ]

  const knownFolders = new Set(folders.map((folder) => folder.id))
  const folderItems: FolderItem[] = folders.map((folder) => ({
    kind: 'folder',
    key: folderKey(folder.id),
    label: folder.name,
    level: 1,
    parentKey: null,
    folder,
    children: documents
      .filter((document) => document.folderId === folder.id)
      .map((document) => documentItem(document, documentKey(document.id), 2, folderKey(folder.id))),
  }))
  // A document whose folder is not among the loaded ones is listed with the loose documents rather than dropped.
  const loose = documents
    .filter((document) => document.folderId === null || !knownFolders.has(document.folderId))
    .map((document) => documentItem(document, documentKey(document.id), 1, null))

  return [...recent, ...folderItems, ...loose]
}

/** The items a person can reach now, in the order they are drawn: a closed branch hides its children. */
export function visibleItems(roots: readonly TreeItem[], isExpanded: (key: string) => boolean): TreeItem[] {
  return roots.flatMap((item) =>
    isBranch(item) && isExpanded(item.key) ? [item, ...visibleItems(item.children, isExpanded)] : [item],
  )
}
