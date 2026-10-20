import { Button, Icon, Menu } from '@yelison/forma-ui'
import { useIntl } from 'react-intl'
import { useNavigate } from 'react-router'

export interface MoreMenuProps {
  onNewFolder: () => void
  onFromTemplate: () => void
}

/** The actions of the Documents screen that are not "New document": they are used now and then, so they are one button. */
export function MoreMenu({ onNewFolder, onFromTemplate }: MoreMenuProps) {
  const intl = useIntl()
  const navigate = useNavigate()

  return (
    <Menu
      label={intl.formatMessage({ id: 'documents.more.menu' })}
      items={[
        { id: 'new-folder', label: intl.formatMessage({ id: 'documents.newFolder' }), onSelect: onNewFolder },
        { id: 'template', label: intl.formatMessage({ id: 'templates.pick' }), onSelect: onFromTemplate },
        {
          id: 'trash',
          label: intl.formatMessage({ id: 'screen.trash' }),
          separatorBefore: true,
          onSelect: () => void navigate('/trash'),
        },
      ]}
    >
      {(trigger) => (
        <Button {...trigger} variant="secondary">
          {intl.formatMessage({ id: 'documents.more' })}
          <Icon name="chevron" />
        </Button>
      )}
    </Menu>
  )
}
