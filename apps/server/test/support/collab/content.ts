import { fragmentName } from '@draftroom/editor-schema'
import { yUpdateToJson } from '@draftroom/editor-schema/convert'
import type { Kysely } from 'kysely'
import * as Y from 'yjs'
import type { Database } from '../../../src/db/tables.ts'

// Document content for the collaboration tests, written as an editor writes it into Yjs and read as the server reads it.

/** Adds a paragraph with this text at the end of the document, as typing it would. */
export function appendParagraph(doc: Y.Doc, text: string): void {
  const paragraph = new Y.XmlElement('paragraph')
  paragraph.insert(0, [new Y.XmlText(text)])
  const fragment = doc.getXmlFragment(fragmentName)
  fragment.insert(fragment.length, [paragraph])
}

/** Deletes the first character of the first paragraph: an edit that adds no struct, so no state vector can tell it was stored. */
export function deleteFirstCharacter(doc: Y.Doc): void {
  const paragraph = doc.getXmlFragment(fragmentName).get(0)
  if (!(paragraph instanceof Y.XmlElement)) throw new Error('The document has no paragraph to delete from')
  const text = paragraph.get(0)
  if (!(text instanceof Y.XmlText)) throw new Error('The paragraph has no text to delete from')
  text.delete(0, 1)
}

/** The text of every paragraph, as the schema's reader sees the state: what is stored and what a client shows. */
export function paragraphsOf(update: Uint8Array): string[] {
  const { content } = yUpdateToJson(update)
  return (content ?? []).flatMap(({ content: inline }) => (inline ?? []).map(({ text }) => text ?? ''))
}

export const paragraphsOfDoc = (doc: Y.Doc): string[] => paragraphsOf(Y.encodeStateAsUpdate(doc))

/** The state in the database for a document. */
export async function storedState(db: Kysely<Database>, documentId: string): Promise<Uint8Array> {
  const row = await db
    .selectFrom('document_states')
    .select('state')
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow()
  return row.state
}

export async function storedParagraphs(db: Kysely<Database>, documentId: string): Promise<string[]> {
  return paragraphsOf(await storedState(db, documentId))
}

/** A document that already has these paragraphs, as a person who worked offline, or the state a test stores. */
export function documentWith(...paragraphs: string[]): Y.Doc {
  const doc = new Y.Doc()
  for (const text of paragraphs) appendParagraph(doc, text)
  return doc
}

/** Writes a state into the database as the server would have: the way a test starts from a document that has content. */
export async function storeState(db: Kysely<Database>, documentId: string, state: Uint8Array): Promise<void> {
  await db.updateTable('document_states').set({ state }).where('document_id', '=', documentId).execute()
}

/** A document whose Yjs state is at least this many bytes, in paragraphs of about a kilobyte: a document over a limit. */
export function documentOfAtLeast(bytes: number): Y.Doc {
  const doc = new Y.Doc()
  const line = 'The harbour lights came on one by one, and the quay filled with people on their way home. '.repeat(11)
  while (Y.encodeStateAsUpdate(doc).byteLength < bytes) {
    // Many paragraphs per check: the size is measured once per batch, not once per paragraph.
    doc.transact(() => {
      for (let paragraph = 0; paragraph < 500; paragraph += 1) appendParagraph(doc, line)
    })
  }
  return doc
}
