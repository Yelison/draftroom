// ProseMirror measures the page to keep the caret in view and to find what is under a point. jsdom has no layout, so it
// has none of the functions that do it: these answer for a page where nothing has a size, which is all a test of the
// editor's behaviour needs.

const emptyRects = (): DOMRectList => Object.assign([], { item: () => null }) as unknown as DOMRectList
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0)

Range.prototype.getClientRects ??= emptyRects
Range.prototype.getBoundingClientRect ??= emptyRect
Document.prototype.elementFromPoint ??= () => null
Element.prototype.scrollIntoView ??= () => {}

// ProseMirror makes a `ClipboardEvent` to paste a string it is given; jsdom has the event's base class only.
globalThis.ClipboardEvent ??= class ClipboardEvent extends Event {
  readonly clipboardData: DataTransfer | null
  constructor(type: string, init: ClipboardEventInit = {}) {
    super(type, init)
    this.clipboardData = init.clipboardData ?? null
  }
}
