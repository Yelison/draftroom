import type { Schema } from '@draftroom/contract'
import { Button } from '@yelison/forma-ui'
import { useEffect, useRef } from 'react'
import { useIntl } from 'react-intl'
import { useMatch, useNavigate } from 'react-router'
import { focusMainContent } from '../../app/mainContent.ts'
import { openShareDialog } from './dialogHistory.ts'

/**
 * The «Share» button of the editor, for the people who can change who has access, and the keeper of the focus around the
 * dialog it opens. When the dialog closes the focus goes back to the button; if the button is not there any more (the
 * person's own role was lowered in the dialog), to the headline of the page, never to the body.
 *
 * It is rendered for every role, and shows the button only to owners, so that it outlives the button.
 */
export function ShareControl({ document }: { document: Pick<Schema<'Document'>, 'id' | 'role'> }) {
  const intl = useIntl()
  const navigate = useNavigate()
  const button = useRef<HTMLButtonElement>(null)
  const open = useMatch('/documents/:documentId/share') !== null
  const wasOpen = useRef(open)

  useEffect(() => {
    const closed = wasOpen.current && !open
    wasOpen.current = open
    if (!closed) return
    if (button.current === null) focusMainContent()
    else button.current.focus()
  }, [open])

  if (document.role !== 'owner') return null
  return (
    <Button ref={button} variant="secondary" onClick={() => openShareDialog(navigate, document.id)}>
      {intl.formatMessage({ id: 'sharing.button' })}
    </Button>
  )
}
