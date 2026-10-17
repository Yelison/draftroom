import { redirect, type RouteObject } from 'react-router'
import { PageTitle } from '../components/PageTitle/PageTitle.tsx'
import { DocumentsScreen } from '../features/documents/DocumentsScreen.tsx'
import { FolderScreen } from '../features/documents/FolderScreen.tsx'
import { EditorSkeleton } from '../features/editor/EditorSkeleton.tsx'
import { HistoryScreen } from '../features/history/HistoryScreen.tsx'
import { HomeScreen } from '../features/home/HomeScreen.tsx'
import { SearchScreen } from '../features/search/SearchScreen.tsx'
import { SharedScreen } from '../features/shared/SharedScreen.tsx'
import { TemplateScreen } from '../features/templates/TemplateScreen.tsx'
import { TrashScreen } from '../features/trash/TrashScreen.tsx'
import type { MessageId } from '../i18n/messages.ts'
import { AppFrame } from './AppFrame.tsx'
import { EditorLayout } from './layouts/EditorLayout.tsx'
import { OverviewLayout } from './layouts/OverviewLayout.tsx'
import type { RouteHandle, Section } from './sections.ts'

/** A route for a screen that has not arrived yet: its headline and nothing else, in the section it belongs to. */
function screen(titleId: MessageId, section?: Section): Pick<RouteObject, 'element' | 'handle'> {
  const handle: RouteHandle = { section }
  return { element: <PageTitle titleId={titleId} />, handle }
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
          { index: true, Component: HomeScreen, handle: { section: 'home' } satisfies RouteHandle },
          { path: 'documents', Component: DocumentsScreen, handle: { section: 'documents' } satisfies RouteHandle },
          {
            path: 'folders/:folderId',
            Component: FolderScreen,
            handle: { section: 'documents' } satisfies RouteHandle,
          },
          {
            path: 'templates/:templateId',
            Component: TemplateScreen,
            handle: { section: 'documents' } satisfies RouteHandle,
          },
          { path: 'shared', Component: SharedScreen, handle: { section: 'shared' } satisfies RouteHandle },
          { path: 'history', Component: HistoryScreen, handle: { section: 'history' } satisfies RouteHandle },
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
          { path: 'trash', Component: TrashScreen, handle: { section: 'documents' } satisfies RouteHandle },
          { path: 'search', Component: SearchScreen, handle: { section: 'documents' } satisfies RouteHandle },
          { path: '*', ...screen('screen.notFound') },
        ],
      },
      {
        Component: EditorLayout,
        children: [
          { path: 'documents/new', ...screen('screen.newDocument', 'documents') },
          {
            path: 'documents/:documentId',
            // The editor brings Tiptap, ProseMirror and Yjs, which no other screen needs: its own chunk, fetched when a
            // document is first opened. The router waits for it before it shows the route, so the screen is never
            // half there and the focus that navigation puts on its headline finds it. When the app opens on a document,
            // the layout is already on screen and the skeleton the screen itself uses stands in the work area.
            HydrateFallback: EditorSkeleton,
            lazy: async () => ({ Component: (await import('../features/editor/EditorScreen.tsx')).EditorScreen }),
            handle: { section: 'documents' } satisfies RouteHandle,
            children: [
              {
                // A dialog over the editor, which the editor shows in its own place (an `Outlet`) once it has a document.
                path: 'share',
                lazy: async () => ({ Component: (await import('../features/sharing/ShareDialog.tsx')).ShareDialog }),
                handle: { section: 'documents', dialog: true } satisfies RouteHandle,
              },
            ],
          },
          { path: 'documents/:documentId/versions', ...screen('screen.versions', 'documents') },
        ],
      },
    ],
  },
]
