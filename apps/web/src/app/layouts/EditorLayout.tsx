import { Outlet } from 'react-router'
import { Explorer } from '../../features/explorer/Explorer.tsx'
import { NavRail } from '../../components/NavRail/NavRail.tsx'
import { AccountControl } from '../../features/auth/AccountControl.tsx'
import { CommentsPanelContext, useCommentsPanelState } from '../../features/comments/commentsPanelState.ts'
import { narrowQuery } from '../DesktopGuard.tsx'
import { focusMainContent } from '../mainContent.ts'
import { MainContent } from './MainContent.tsx'
import styles from './EditorLayout.module.css'

/**
 * The layout of a document: a compact rail, the explorer column and the work area, which takes the rest of the width. It
 * keeps whether the comments panel is open, so the choice outlasts the document: opening another one keeps the panel as
 * it was.
 */
export function EditorLayout() {
  const commentsPanel = useCommentsPanelState()

  return (
    <CommentsPanelContext value={commentsPanel}>
      <div className={styles.layout}>
        <NavRail variant="compact" footer={<AccountControl variant="compact" />} />
        <div
          className={styles.explorer}
          // The explorer is left out of a window narrower than a desktop (CSS), and the browser takes the focus off what is
          // hidden while it has it, which leaves it on the page. In a narrow window nothing in the explorer can be reached,
          // so a focus that leaves it for no element is that: it goes to the page, as the guard of the width used to do.
          onBlur={(event) => {
            if (event.relatedTarget === null && window.matchMedia(narrowQuery).matches) focusMainContent()
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
