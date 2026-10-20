# 0020 · Comments in the margin, one scroll

Status: accepted (2026-10-20, r12)

## Context

The editor had three zones that scrolled on their own: the explorer, the sheet and the list of comments. Three scroll bars are three places to look, and the list of comments was a second document beside the first one: a thread was read in one place and its text in another, joined by a click.

The owner asked for one scroll and chose, among three ways to have it, the one that also removes the second list: each comment goes in a margin beside the text it is about and moves with it. The cost is known and was accepted: the text gets narrower at 1280 px, and where a paragraph gathers several comments something has to give way.

## Decision

1. **The page is the only thing that scrolls.** The band (where the document is, who is in it, its state, its history, sharing) and the bar (formatting, which threads are shown, Comments and Activity, the button that shows the margin) are one sticky block at the top. The sheet and the margin are in the page and go by together. The explorer is fixed beside the page and scrolls on its own only if a section that is open is taller than the window.
2. **Each thread is level with its text.** The anchor is the one ADR 0018 resolves (`usePlacements`, `anchors`): the margin measures where it starts on the page and puts the card there. The thread the person is on (the active one) is its whole card, with the conversation, the reply field, Resolve and Show in text. The others are compact: the quoted text, who started the thread and when, two lines of what was said and how many replies it has. Choosing a compact card, with the pointer or the keyboard, makes it the active one.
3. **Where each card goes is a pure function.** `placeMargin` takes the height of each anchor (measured with no gap in the text), the height of each card and the room between cards, and answers with the top of each card and the gaps the text has to open. It is a table of tests: anchors far apart, together, the active card at its full height, orphans at the end, an empty margin.
4. **When two anchors are close, the second card is pushed down; when the margin is taller than the text there, the text gives way.** The two are decided by the block of the text that holds each anchor. Two threads about the same paragraph cannot be separated by opening room in the middle of it, so the second one is pushed down under the first. A thread about the next block would then be pushed away from its text, so the text opens a gap after the block of the card above and the next card stays level. Nothing overlaps: the margin never covers the text and no card covers another. The gap is drawn with a node decoration (`commentGaps`), in a plugin of its own: it is of the view, so it touches neither the Yjs document nor the undo history, and, unlike the highlights, it depends on no order of plugins.
5. **Measuring does not feed on itself.** What is measured is the anchor with the gaps already opened taken out (they are in the DOM, as a data attribute), so a second pass over a page that has them answers what the first one did and nothing moves. The observers measure on the next frame.
6. **Threads with no text go at the end of the margin, under a label of their own** ("Comments on removed text"), as the orphaned state of the card said before. Threads the document has not placed yet (it is still loading, or it is the copy this device kept) are listed there without the label, since they are not orphans (protocol §10.3). The text is not shown until the comments of the document have arrived, so they do not open gaps under the person's eyes.
7. **The filter decides what is in the margin.** Open, Resolved and All are chips in the bar, with their counts. A resolved thread is placed as an open one is, without a highlight and out of reach of the key and the click (the plugin places it and does not draw it). Activity opens as a panel at the edge of the window, over the margin; it is the only list apart from the text.
8. **Widths.** The margin is the width of the old panel less the room around it (304 px, from the existing tokens, no new one); the sheet has the rest, up to 708 px. At 1440 px the sheet keeps its 708 px; at 1280 px it is 568 px and the margin keeps its width. The old panel of 328 px beside the sheet is gone: 328 px is now the width of the Activity panel. The button of the bar shows and hides the margin, which is what closing the panel was (and, like it, starts hidden below 1440 px, until the person chooses). Hidden, the sheet has its 708 px at either width.
9. **Under 1280 px there is no beside.** The margin goes under the sheet, in the order of the text, with the same cards, and nothing is measured and no gap is opened. It is the arrangement the plan already asked for under 1280 px, and it is what a zoom of 200 % gets. Comments in line after each paragraph would need the same measures inside the text and would break the paragraphs of a document that is being edited.
10. **What the person chose outlasts the screen.** Which threads are shown, the tab, whether the margin is shown and the thread the person is on live in the layout of the editor, with no dependency on the editor itself, so the history of the document and the next document find them as they were.
11. **The explorer is the sections of the Documents screen**, folded but for Pinned, in a row of one line with the open document marked. Opening a document asks the server for no folder: a folder is asked for when it is opened.

## Relation to ADR 0018

The keyboard flow stays as it was: the key from the text to the thread (and to a new comment), `aria-current` on the thread, the focus plan when a card leaves, Escape back to the text, and the key for a commenter, whose text takes no edits. The thread the key goes to is the active one and gets the focus. What changes is that the plugin of the highlights also places the resolved threads, which it does not draw. 0018 has a note of it.

## Consequences

- There is no list of comments apart from the text. A person who wants every thread in a row has the filter, and Activity for what happened.
- The text is narrower at 1280 px (568 px against 708) and has gaps where a paragraph gathers comments. The filter is the way to shorten the page; with the margin hidden the text has its full width.
- The cards of the margin are in the page in the order of the text, whatever their position, so Tab and a screen reader follow the document.
- Choosing a compact card makes it taller and the cards below move; the text opens or closes the room it needs, which moves it too. It is the cost of the whole card being where the text is.
- A tooltip in the button that comments on a selection took the Escape that closes the form, because the pointer was still over it: while the form is open the button has none.

## Alternatives considered

- **The page scrolls with a list of comments beside it** (the cheap one): no measuring, but the list stays a second document, comments and text do not line up, and the explorer becomes a drawer.
- **One comment at a time in the panel, with arrows:** hides the conversation of the document.
- **Cards pushed only, never opening room in the text:** simpler, but a paragraph with several comments pushes every later card away from its text, which is the thing the margin is for.
- **Opening the room with margins or with spacer widgets between blocks:** margins collapse with those of the next block and spacers add the margin of both, so the measure that the layout takes out again would not be the room that was opened. Padding at the end of the block is exact.
- **Comments in line after each paragraph under 1280 px:** see 9.
