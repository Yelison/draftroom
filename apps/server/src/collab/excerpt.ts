import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { JSONContent } from '@tiptap/core'
import { sql, type Kysely } from 'kysely'
import type { Database } from '../db/tables.ts'
import type { CollabLog } from './log.ts'

// The excerpt a document shows in lists is the start of its first paragraph. It is derived from the Yjs state that was
// just stored and written to `documents.excerpt` after the store is acknowledged, so computing it never delays the
// acknowledgement of "stored" (plan, T6.1). Who may read it is decided where it is listed, with the rest of the document.

/** The longest excerpt, in code points: `maxLength` of `Document.excerpt` in the contract, and the check of the column. */
export const excerptLimit = 300

/**
 * The text of the first paragraph that has any, in document order (one inside a list item counts), or `null` when the
 * document has none. A line break reads as a space and runs of white space as one, so the excerpt is a single line. It is
 * cut in code points, never inside a character such as an emoji.
 */
export function excerptOf(content: JSONContent): string | null {
  const text = firstParagraphText(content)
  if (text === null) return null
  return Array.from(text).slice(0, excerptLimit).join('').trimEnd()
}

function firstParagraphText(node: JSONContent): string | null {
  if (node.type === 'paragraph') {
    const text = inlineText(node).replace(/\s+/g, ' ').trim()
    return text === '' ? null : text
  }
  for (const child of node.content ?? []) {
    const found = firstParagraphText(child)
    if (found !== null) return found
  }
  return null
}

function inlineText(node: JSONContent): string {
  if (node.type === 'hardBreak') return ' '
  return (node.text ?? '') + (node.content ?? []).map(inlineText).join('')
}

/** Where excerpts are kept; PostgreSQL unless a test needs a writer that is slow or fails. */
export interface ExcerptWriter {
  /** Writes nothing, and does not fail, for a document that no longer exists. */
  write(documentId: string, excerpt: string | null): Promise<void>
}

/**
 * Only the excerpt changes: `revision` and `updated_at` belong to what people do to a document, and a typing session
 * must neither fail their If-Match checks nor reorder the lists.
 */
export function createPostgresExcerptWriter(database: Kysely<Database>): ExcerptWriter {
  return {
    async write(documentId, excerpt) {
      await database
        .updateTable('documents')
        .set({ excerpt })
        .where('id', '=', documentId)
        // Not written when it is already right: most stores do not change the first paragraph.
        .where(sql<boolean>`excerpt is distinct from ${excerpt}`)
        .execute()
    },
  }
}

export interface ExcerptUpdates {
  /** Computes and writes the excerpt of a state that was just stored, once the work already queued has run. */
  schedule(documentId: string, state: Uint8Array): void
}

export function createExcerptUpdates(writer: ExcerptWriter, log: CollabLog): ExcerptUpdates {
  // The last write of each document that is still running. A later one waits for it, so two stores in quick succession
  // cannot reach the database in the other order and leave the older excerpt.
  const tails = new Map<string, Promise<void>>()

  async function update(documentId: string, state: Uint8Array): Promise<void> {
    try {
      await writer.write(documentId, excerptOf(yUpdateToJson(state)))
    } catch (error) {
      // The excerpt is a convenience: the next store computes it again, and the content is already safe.
      log.error({ documentId, error }, 'updating the excerpt of a document failed')
    }
  }

  return {
    schedule(documentId, state) {
      // A macrotask, not a microtask: the acknowledgement is sent by hooks that run as microtasks after the store.
      setImmediate(() => {
        const next = (tails.get(documentId) ?? Promise.resolve()).then(() => update(documentId, state))
        tails.set(documentId, next)
        void next.then(() => {
          if (tails.get(documentId) === next) tails.delete(documentId)
        })
      })
    },
  }
}
