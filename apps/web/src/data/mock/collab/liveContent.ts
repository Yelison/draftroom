// The mock plays the server, which converts a stored version to the editor's content and writes it into the live document.
// oxlint-disable-next-line no-restricted-imports
import { replaceFragmentContent, yUpdateToJson } from '@draftroom/editor-schema/convert'
import { fragmentName } from '@draftroom/editor-schema'
import type * as Y from 'yjs'

/**
 * Makes the live document hold what a version held, as the server does when a version is restored: the content is written
 * by diff into the fragment, in one transaction, so the people who have it open receive it as an ordinary update.
 */
export function replaceLiveContent(live: Y.Doc, version: Uint8Array): void {
  const content = yUpdateToJson(version)
  live.transact(() => replaceFragmentContent(live.getXmlFragment(fragmentName), content), 'restore')
}
