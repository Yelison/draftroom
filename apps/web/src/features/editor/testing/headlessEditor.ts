import { editorExtensions, fragmentName } from '@draftroom/editor-schema'
import { Editor } from '@tiptap/core'
import { Collaboration } from '@tiptap/extension-collaboration'
import type * as Y from 'yjs'
import { NewBlockText } from '../NewBlockText.ts'
import './jsdomShims.ts'

/** The editor of a person over their Yjs document, as the app makes it but without a screen, a provider or carets. */
export function openHeadlessEditor(document: Y.Doc): Editor {
  return new Editor({
    extensions: [...editorExtensions(), Collaboration.configure({ document, field: fragmentName }), NewBlockText],
  })
}
