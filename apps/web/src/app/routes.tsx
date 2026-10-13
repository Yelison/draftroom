import { redirect, type RouteObject } from 'react-router'
import { PageTitle } from '../components/PageTitle/PageTitle.tsx'
import type { MessageId } from '../i18n/messages.ts'
import { AppFrame } from './AppFrame.tsx'
import { EditorLayout } from './layouts/EditorLayout.tsx'
import { OverviewLayout } from './layouts/OverviewLayout.tsx'
import type { Section } from './sections.ts'

/** A route for a screen that has not arrived yet: its headline and nothing else, in the section it belongs to. */
function screen(titleId: MessageId, section?: Section): Pick<RouteObject, 'element' | 'handle'> {
  return { element: <PageTitle titleId={titleId} />, handle: { section } }
}

/**
 * The route table. Each screen replaces the `screen(…)` of its route when it is built; the section stays the one the
 * rail highlights. Folders, documents, templates, the trash and the search belong to Documents.
 */
export const routes: RouteObject[] = [
  {
    Component: AppFrame,
    children: [
      {
        Component: OverviewLayout,
        children: [
          { index: true, ...screen('nav.home', 'home') },
          { path: 'documents', ...screen('nav.documents', 'documents') },
          { path: 'folders/:folderId', ...screen('screen.folder', 'documents') },
          { path: 'templates/:templateId', ...screen('screen.template', 'documents') },
          { path: 'shared', ...screen('nav.shared', 'shared') },
          { path: 'history', ...screen('nav.history', 'history') },
          {
            path: 'settings',
            children: [
              // Done by the router before anything renders, so there is no page in between to take the focus.
              { index: true, loader: () => redirect('/settings/profile') },
              { path: 'profile', ...screen('nav.settings', 'settings') },
              { path: 'workspace', ...screen('nav.settings', 'settings') },
              { path: 'members', ...screen('nav.settings', 'settings') },
              { path: 'appearance', ...screen('nav.settings', 'settings') },
            ],
          },
          { path: 'trash', ...screen('screen.trash', 'documents') },
          { path: 'search', ...screen('screen.search', 'documents') },
          { path: '*', ...screen('screen.notFound') },
        ],
      },
      {
        Component: EditorLayout,
        children: [
          { path: 'documents/new', ...screen('screen.newDocument', 'documents') },
          { path: 'documents/:documentId', ...screen('screen.document', 'documents') },
          { path: 'documents/:documentId/share', ...screen('screen.share', 'documents') },
          { path: 'documents/:documentId/versions', ...screen('screen.versions', 'documents') },
        ],
      },
    ],
  },
]
