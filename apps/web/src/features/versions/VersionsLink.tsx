import { buttonClassName } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { Link } from 'react-router'

/** The way to the history of a document from its editor. Everyone who can read the document can look at its versions. */
export function VersionsLink({ documentId }: { documentId: string }) {
  const intl = useIntl()
  return (
    <Link to={`/documents/${documentId}/versions`} className={buttonClassName({ variant: 'secondary' })}>
      {intl.formatMessage({ id: 'versions.link' })}
    </Link>
  )
}
