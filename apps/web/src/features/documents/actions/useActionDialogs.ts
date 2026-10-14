import type { Schema } from '@draftroom/contract'
import { useEffect, useEffectEvent, useRef, useState } from 'react'

/** What the person is acting on, and with which dialog. */
export type ActionTarget =
  | { kind: 'details'; document: Schema<'Document'> }
  | { kind: 'archive'; document: Schema<'Document'> }
  | { kind: 'create-folder'; workspaceId: string }
  | { kind: 'rename-folder'; folder: Schema<'Folder'> }

export interface ActionDialogs {
  target: ActionTarget | null
  /** Opens a dialog, or hands over from one to another, which keeps the first opener as the place the focus returns to. */
  open: (target: ActionTarget) => void
  close: () => void
}

/**
 * Which action dialog is open. Forma UI's dialog puts the focus back on the control that opened it; when that control is
 * gone (the row of the document that was archived) the focus would fall to the page, so the screen says where it goes
 * instead.
 */
export function useActionDialogs(focusFallback: () => void): ActionDialogs {
  const [target, setTarget] = useState<ActionTarget | null>(null)
  const closing = useRef(false)
  const fallback = useEffectEvent(focusFallback)

  // Runs after the dialog has put the focus back, which it does when it closes.
  useEffect(() => {
    if (target !== null || !closing.current) return
    closing.current = false
    if (document.activeElement === null || document.activeElement === document.body) fallback()
  }, [target])

  return {
    target,
    open: setTarget,
    close: () => {
      closing.current = true
      setTarget(null)
    },
  }
}
