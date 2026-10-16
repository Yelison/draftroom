import { useQuery } from '@tanstack/react-query'
import { Button, Dialog } from '@yelison/forma-ui'
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

  return (
    <Dialog
      open
      size="wide"
      onClose={close}
      title={intl.formatMessage({ id: 'sharing.title' }, { title: document.data?.title ?? '' })}
      description={intl.formatMessage({ id: 'sharing.description' })}
      footer={<Button onClick={close}>{intl.formatMessage({ id: 'sharing.done' })}</Button>}
    >
      {document.data === undefined ? <ShareSkeleton /> : <ShareBody document={document.data} />}
    </Dialog>
  )
}
