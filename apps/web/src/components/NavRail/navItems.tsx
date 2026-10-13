import { Icon } from '@yelison/forma-ui'
import type { ReactNode } from 'react'
import type { MessageId } from '../../i18n/messages.ts'
import type { Section } from '../../app/sections.ts'

export interface NavItem {
  section: Section
  to: string
  /** The label of the item, which is also the headline of the page it opens (the rail names where you are). */
  labelId: MessageId
  icon: ReactNode
}

const iconSize = 24

export const navItems: readonly NavItem[] = [
  { section: 'home', to: '/', labelId: 'nav.home', icon: <Icon name="home" size={iconSize} /> },
  { section: 'documents', to: '/documents', labelId: 'nav.documents', icon: <Icon name="file" size={iconSize} /> },
  { section: 'shared', to: '/shared', labelId: 'nav.shared', icon: <Icon name="team" size={iconSize} /> },
  { section: 'history', to: '/history', labelId: 'nav.history', icon: <Icon name="clock" size={iconSize} /> },
  // Settings opens its first tab directly: the redirect from `/settings` is for addresses typed or bookmarked.
  {
    section: 'settings',
    to: '/settings/profile',
    labelId: 'nav.settings',
    icon: <Icon name="settings" size={iconSize} />,
  },
]
