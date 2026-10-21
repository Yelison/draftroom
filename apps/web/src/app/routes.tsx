import { redirect, type RouteObject } from 'react-router'
import { PageTitle } from '../components/PageTitle/PageTitle.tsx'
import { SignInScreen } from '../features/auth/SignInScreen.tsx'
import { SignUpScreen } from '../features/auth/SignUpScreen.tsx'
import { DocumentsScreen } from '../features/documents/DocumentsScreen.tsx'
import { FolderScreen } from '../features/documents/FolderScreen.tsx'
import layout from '../features/documents/ListLayout.module.css'
import { EditorSkeleton } from '../features/editor/EditorSkeleton.tsx'
import { HistoryScreen } from '../features/history/HistoryScreen.tsx'
import { HomeScreen } from '../features/home/HomeScreen.tsx'
import { MembersScreen } from '../features/members/MembersScreen.tsx'
import { SearchScreen } from '../features/search/SearchScreen.tsx'
import { settingsAddress, settingsSections } from '../features/settings/useSettingsDialog.ts'
import { SharedScreen } from '../features/shared/SharedScreen.tsx'
import { TemplateScreen } from '../features/templates/TemplateScreen.tsx'
import { TrashScreen } from '../features/trash/TrashScreen.tsx'
import { VersionsSkeleton } from '../features/versions/VersionsSkeleton.tsx'
import type { MessageId } from '../i18n/messages.ts'
import { AppFrame } from './AppFrame.tsx'
import { AuthLayout } from './layouts/AuthLayout.tsx'
import { EditorLayout } from './layouts/EditorLayout.tsx'
import { OverviewLayout } from './layouts/OverviewLayout.tsx'
import type { RouteHandle, Section } from './sections.ts'
import { SessionGate } from './SessionGate.tsx'

/** A route for a screen that has not arrived yet: its headline and nothing else, in the section it belongs to and in the column of the screens that list. */
function screen(titleId: MessageId, section?: Section): Pick<RouteObject, 'element' | 'handle'> {
  const handle: RouteHandle = { section }
  return {
    element: (
      <div className={layout.screen}>
        <PageTitle titleId={titleId} />
      </div>
    ),
    handle,
  }
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
        // What a person sees before they are signed in: it is outside the gate, which would send them back here.
        Component: AuthLayout,
        children: [
          { path: 'sign-in', Component: SignInScreen },
          { path: 'sign-up', Component: SignUpScreen },
        ],
      },
      {
        // Everything else needs a signed-in person.
        Component: SessionGate,
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
              { path: 'members', Component: MembersScreen, handle: { section: 'members' } satisfies RouteHandle },
              // Settings is a dialog over the page the person is on, kept in the address as `?settings=` and not as a route, which
              // would take the page from behind it (the editor with its document). These paths are the addresses it had when it
              // was a page: typed or bookmarked, they open the dialog over Home. The router redirects before anything renders.
              { path: 'settings', loader: () => redirect(settingsAddress('profile')) },
              ...settingsSections.map((section) => ({
                path: `settings/${section}`,
                loader: () => redirect(settingsAddress(section)),
              })),
              // Members moved out of Settings to a page of its own; an address typed or bookmarked still lands there.
              { path: 'settings/members', loader: () => redirect('/members') },
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
                    lazy: async () => ({
                      Component: (await import('../features/sharing/ShareDialog.tsx')).ShareDialog,
                    }),
                    handle: { section: 'documents', dialog: true } satisfies RouteHandle,
                  },
                ],
              },
              {
                // Its own chunk, as the editor's: the reader brings Tiptap, ProseMirror and Yjs. It is in the editor's layout,
                // which hides the explorer here and keeps it mounted, so coming back to the document finds it as it was.
                path: 'documents/:documentId/versions',
                HydrateFallback: VersionsSkeleton,
                lazy: async () => ({
                  Component: (await import('../features/versions/VersionsScreen.tsx')).VersionsScreen,
                }),
                handle: { section: 'documents' } satisfies RouteHandle,
              },
            ],
          },
        ],
      },
    ],
  },
]
