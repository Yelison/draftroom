import { useQuery } from '@tanstack/react-query'
import { Avatar, Icon, Menu, type MenuItem } from '@yelison/forma-ui'
import { useEffect, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useIntl } from 'react-intl'
import { presenceLookOf } from '../../collab/presenceColor.ts'
import type { Schema } from '@draftroom/contract'
import { useDataSource } from '../../data/useDataSource.ts'
import { useSignOut } from '../../features/auth/useSignOut.ts'
import { meQuery } from '../../features/editor/meQuery.ts'
import { SettingsDialog } from '../../features/settings/SettingsDialog.tsx'
import { useSettingsDialog } from '../../features/settings/useSettingsDialog.ts'
import styles from './NavRail.module.css'

/**
 * The person who is signed in, at the foot of the rail, and what they can do with their account: their avatar and name
 * are the button of a menu with Settings and Sign out. It has no place of its own before the person is known: it is the
 * last thing in the rail, so nothing above it can be moved by it.
 *
 * It owns the focus of Settings too. The dialog is a part of the address (`?settings=`), so it can be open when the page
 * is first seen, with nothing having had the focus; whichever way it closes (its buttons, Escape, the browser's Back), the
 * focus returns to the person's button, and never to the page's body.
 */
export function AccountMenu() {
  const me = useQuery(meQuery(useDataSource())).data
  const settings = useSettingsDialog()
  const trigger = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const open = settings.section !== null

  useEffect(() => {
    // The dialog has closed by the time this runs, which is when the page is no longer inert and the focus can be given.
    if (wasOpen.current && !open) trigger.current?.focus()
    wasOpen.current = open
  }, [open])

  return (
    <>
      {me !== undefined && <PersonMenu me={me} triggerRef={trigger} onSettings={settings.open} />}
      {/* Out of the landmark: a dialog is not a part of the navigation, whatever the DOM it grows from says. */}
      {settings.section !== null &&
        createPortal(<SettingsDialog section={settings.section} onClose={settings.close} />, document.body)}
    </>
  )
}

interface PersonMenuProps {
  me: Schema<'Me'>
  triggerRef: RefObject<HTMLElement | null>
  onSettings: () => void
}

/**
 * The menu of Forma UI, which opens from a `Button`, an `IconButton` or a `FilterChip`. The trigger here is the row of the
 * rail, so it takes the same properties by hand (`aria-haspopup`, `aria-expanded`, and Enter, Space and the down arrow to
 * open it).
 */
function PersonMenu({ me, triggerRef, onSettings }: PersonMenuProps) {
  const intl = useIntl()
  const { signOut, pending, failure, dialogs } = useSignOut()
  const items: MenuItem[] = [
    {
      id: 'settings',
      label: intl.formatMessage({ id: 'account.menu.settings' }),
      icon: 'settings',
      onSelect: onSettings,
    },
    {
      id: 'sign-out',
      label: intl.formatMessage({ id: 'auth.signOut.action' }),
      icon: 'lock',
      onSelect: () => {
        if (!pending) signOut(me.id)
      },
    },
  ]

  return (
    <>
      <Menu label={intl.formatMessage({ id: 'account.menu.label' })} items={items} placement="bottom-start">
        {({ ref, ...trigger }) => (
          <button
            {...trigger}
            ref={(node) => {
              ref(node)
              triggerRef.current = node
            }}
            type="button"
            className={styles.person}
            title={me.name}
            aria-busy={pending || undefined}
          >
            <Avatar name={me.name} size="small" tone={presenceLookOf(me.id).tone} decorative />
            <span className={styles.personName}>{me.name}</span>
            <Icon name="chevron" size={16} className={styles.personChevron} />
          </button>
        )}
      </Menu>
      {failure !== null && (
        <p role="alert" className={styles.failed}>
          {intl.formatMessage({ id: 'auth.signOut.failed' })}
        </p>
      )}
      {createPortal(dialogs, document.body)}
    </>
  )
}
