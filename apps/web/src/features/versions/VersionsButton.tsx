import { IconButton, Tooltip } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useNavigate } from 'react-router'

/**
 * The way to the history of a document from its editor: an icon, so that the band of the editor fits in either language
 * with other people in it. Everyone who can read the document can look at its versions.
 */
export function VersionsButton({ documentId }: { documentId: string }) {
  const intl = useIntl()
  const navigate = useNavigate()
  const label = intl.formatMessage({ id: 'versions.link' })
  return (
    <Tooltip content={label} placement="bottom-end" describe={false}>
      {(trigger) => (
        <IconButton
          {...trigger}
          icon="clock"
          label={label}
          onClick={() => void navigate(`/documents/${documentId}/versions`)}
        />
      )}
    </Tooltip>
  )
}
