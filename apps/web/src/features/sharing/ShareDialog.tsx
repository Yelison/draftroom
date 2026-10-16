import { useQuery } from '@tanstack/react-query'
import { Button, Dialog } from '@yelison/forma-ui'
import { useEffect, useRef, useState } from 'react'
import { useIntl } from 'react-intl'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useDataSource } from '../../data/useDataSource.ts'
import { documentQuery } from '../editor/documentQuery.ts'
import { closeShareDialog } from './dialogHistory.ts'
import { ShareBody } from './ShareBody.tsx'
import { ShareSkeleton } from './ShareSkeleton.tsx'

/**
 * The route `/documents/:documentId/share`: a dialog over the editor, which stays where it is behind it. Closing it, by
 * its button, by Escape or by the browser's Back, leaves the route; the button that opened it takes the focus back
 * (`ShareControl`), because the dialog is gone by then.
 */
export function ShareDialog() {
  const intl = useIntl()
  const navigate = useNavigate()
  const location = useLocation()
  const { documentId } = useParams()
  if (documentId === undefined) throw new Error('The route of the share dialog has no :documentId')
  const dataSource = useDataSource()
  const document = useQuery(documentQuery(dataSource, documentId))
  const close = () => closeShareDialog(navigate, location, documentId)

  // The live region lives here, above what the body shows, so that what is said survives the body changing under it:
  // an owner who lowers or removes their own role leaves the editor of access for the message of the owners.
  // Counted, so that the same message twice in a row is a new element and is announced again.
  const [announcement, setAnnouncement] = useState({ count: 0, text: '' })
  const lostOwnership = useRef(false)
  const done = useRef<HTMLButtonElement>(null)
  const announce = (text: string) => {
    // Once the person is no longer an owner this is the only thing to say: the change that caused it is old news.
    if (!lostOwnership.current) setAnnouncement(({ count }) => ({ count: count + 1, text }))
  }

  // The role comes with the document, and a change of access made in this dialog can take it from the person. What had the
  // focus (a role selector of the editor of access) goes with it, so the focus moves to the button that is always there.
  const role = document.data?.role
  const wasOwner = useRef(false)
  useEffect(() => {
    if (role === 'owner') wasOwner.current = true
    if (role === undefined || role === 'owner' || !wasOwner.current || lostOwnership.current) return
    lostOwnership.current = true
    setAnnouncement(({ count }) => ({
      count: count + 1,
      text: intl.formatMessage({ id: 'sharing.announce.ownerLost' }),
    }))
    done.current?.focus()
  }, [role, intl])

  return (
    <Dialog
      open
      size="wide"
      onClose={close}
      title={
        document.data === undefined
          ? intl.formatMessage({ id: 'sharing.button' })
          : intl.formatMessage({ id: 'sharing.title' }, { title: document.data.title })
      }
      description={intl.formatMessage({ id: 'sharing.description' })}
      footer={
        <Button ref={done} onClick={close}>
          {intl.formatMessage({ id: 'sharing.done' })}
        </Button>
      }
    >
      {document.data === undefined ? <ShareSkeleton /> : <ShareBody document={document.data} announce={announce} />}
      <p role="status" className="forma-visually-hidden">
        {announcement.text !== '' && <span key={announcement.count}>{announcement.text}</span>}
      </p>
    </Dialog>
  )
}
