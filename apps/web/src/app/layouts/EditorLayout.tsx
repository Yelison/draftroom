import { Outlet, useMatch } from 'react-router'
import { Explorer } from '../../features/explorer/Explorer.tsx'
import { NavRail } from '../../components/NavRail/NavRail.tsx'
import { AccountControl } from '../../features/auth/AccountControl.tsx'
import { CommentsPanelContext, useCommentsPanelState } from '../../features/comments/commentsPanelState.ts'
import { focusMainContent } from '../mainContent.ts'
import { isNarrowWindow } from '../narrowWindow.ts'
import { MainContent } from './MainContent.tsx'
import styles from './EditorLayout.module.css'

/**
 * The layout of a document: a compact rail, the explorer column and the work area, which takes the rest of the width. It
 * keeps whether the comments panel is open, so the choice outlasts the document: opening another one keeps the panel as
 * it was.
 *
 * The history of a document has one task, so the explorer is left out of it. It is hidden and not unmounted, so the folders
 * and the search the person left are there when they come back, and `inert` keeps it out of the Tab order and the reading
 * order of a screen reader.
 */
export function EditorLayout() {
  const commentsPanel = useCommentsPanelState()
  const inHistory = useMatch('/documents/:documentId/versions') !== null

  return (
    <CommentsPanelContext value={commentsPanel}>
      <div className={inHistory ? `${styles.layout} ${styles.history}` : styles.layout}>
        <NavRail variant="compact" footer={<AccountControl variant="compact" />} />
        <div
          className={styles.explorer}
          inert={inHistory}
          // The explorer is left out of a window narrower than a desktop (CSS), and the browser takes the focus off what is
          // hidden while it has it, which leaves it on the page. In a narrow window nothing in the explorer can be reached,
          // so a focus that leaves it for no element is that: it goes to the page, as the guard of the width used to do.
          onBlur={(event) => {
            if (event.relatedTarget === null && isNarrowWindow()) focusMainContent()
          }}
        >
          <Explorer />
        </div>
        <MainContent className={styles.main}>
          <Outlet />
        </MainContent>
      </div>
    </CommentsPanelContext>
  )
}
