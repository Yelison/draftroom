// A measurement, not part of the product: how much the Yjs map `__tiptap_position_migrations:root:default` grows in an
// editing session (ADR 0011, decision 2). Nothing is built from it, but `npm run typecheck` checks it with the sources,
// so it cannot break unnoticed when a dependency changes. Run it with
//
//   npm run measure:position-migrations -w @draftroom/server           # every scenario
//   npm run measure:position-migrations -w @draftroom/server -- C       # one of them
//
// It builds the editor of the product (the schema of `@draftroom/editor-schema` and the Collaboration extension, in jsdom)
// for each client, relays every Yjs update between them as the server would, and drives them with a seeded generator of
// operations, so the same command gives the same operations. The ids of the Yjs clients are random, so the sizes vary by a
// few percent between runs. Every scenario ends by checking that the clients hold the same document.
import { JSDOM } from 'jsdom'

const SEED = 1
const SESSIONS_SEED = 7

// ProseMirror needs a DOM: jsdom, with the two geometry methods it does not implement, which only scrolling reads.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
const globals: Record<string, unknown> = globalThis
for (const name of [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'MutationObserver',
  'DOMParser',
  'Range',
  'Text',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'Event',
  'KeyboardEvent',
  'InputEvent',
  'DocumentFragment',
]) {
  const value: unknown = Reflect.get(dom.window, name)
  if (value !== undefined) Object.defineProperty(globals, name, { value, configurable: true, writable: true })
}
const emptyRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
const noRects = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
dom.window.Range.prototype.getBoundingClientRect = () => emptyRect
dom.window.Range.prototype.getClientRects = () => noRects as unknown as DOMRectList
dom.window.Element.prototype.getClientRects = () => noRects as unknown as DOMRectList
dom.window.HTMLElement.prototype.scrollIntoView = () => undefined
Reflect.set(dom.window.document, 'elementFromPoint', () => null)

// The libraries are loaded after the globals exist.
const { Editor } = await import('@tiptap/core')
const { Collaboration } = await import('@tiptap/extension-collaboration')
const { TextSelection } = await import('@tiptap/pm/state')
const { editorExtensions, fragmentName } = await import('@draftroom/editor-schema')
const { jsonToYUpdate, yUpdateToJson } = await import('@draftroom/editor-schema/convert')
const Y = await import('yjs')

const MAP_NAME = '__tiptap_position_migrations:root:default'

interface Client {
  readonly doc: InstanceType<typeof Y.Doc>
  readonly editor: InstanceType<typeof Editor>
}

/** A small deterministic generator: the same seed gives the same session. */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const words = [
  'harbour',
  'light',
  'quay',
  'tide',
  'north',
  'lantern',
  'crew',
  'ferry',
  'fog',
  'anchor',
  'plan',
  'review',
]

const openingDocument = () =>
  jsonToYUpdate({
    type: 'doc',
    content: Array.from({ length: 12 }, (_, index) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Opening paragraph ${index} of the notes for the autumn plan.` }],
    })),
  })

/** A client that starts from a state and exchanges updates with the others. */
function openClient(peers: readonly Client[], state: Uint8Array): Client {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  const element = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(element)
  const editor = new Editor({
    element,
    extensions: [...editorExtensions(), Collaboration.configure({ document: doc, field: fragmentName })],
  })
  // The relay: whatever one client does reaches the others, as the server would carry it.
  for (const peer of peers) {
    peer.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'relay') Y.applyUpdate(doc, update, 'relay')
    })
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'relay') Y.applyUpdate(peer.doc, update, 'relay')
    })
  }
  return { doc, editor }
}

type Operation = 'type' | 'enter' | 'join' | 'heading' | 'list' | 'sink' | 'lift' | 'bold' | 'paste' | 'delete'

/** The operations that move characters or nodes between nodes, which is when the binding writes an entry. */
const structural = new Set<Operation>(['enter', 'join', 'heading', 'list', 'sink', 'lift', 'paste', 'delete'])

type Mix = readonly (readonly [Operation, number])[]

const mixes: Readonly<Record<string, Mix>> = {
  'typing only': [['type', 1]],
  'prose-heavy mix': [
    ['type', 90],
    ['enter', 4],
    ['join', 1],
    ['heading', 1],
    ['list', 1],
    ['bold', 2],
    ['delete', 1],
  ],
  'realistic mix': [
    ['type', 60],
    ['enter', 10],
    ['join', 5],
    ['heading', 4],
    ['list', 4],
    ['sink', 2],
    ['lift', 2],
    ['bold', 5],
    ['paste', 3],
    ['delete', 5],
  ],
  'structural only': [
    ['enter', 25],
    ['join', 15],
    ['heading', 15],
    ['list', 15],
    ['sink', 10],
    ['lift', 10],
    ['paste', 5],
    ['delete', 5],
  ],
}

function pick(mix: Mix, random: () => number): Operation {
  const total = mix.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = random() * total
  for (const [operation, weight] of mix) {
    roll -= weight
    if (roll <= 0) return operation
  }
  return mix[0]?.[0] ?? 'type'
}

function perform({ editor }: Client, operation: Operation, random: () => number): void {
  const size = editor.state.doc.content.size
  const at = Math.max(1, Math.min(size - 1, Math.floor(1 + random() * (size - 1))))
  const select = (from: number, to = from) => {
    const { doc } = editor.state
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.between(doc.resolve(from), doc.resolve(Math.min(to, doc.content.size))),
      ),
    )
  }
  select(at)
  const word = words[Math.floor(random() * words.length)] ?? 'word'
  switch (operation) {
    case 'type':
      editor.commands.insertContent(`${word} `)
      break
    case 'enter':
      editor.commands.splitBlock()
      break
    case 'join':
      editor.commands.joinBackward()
      break
    case 'heading':
      editor.commands.toggleHeading({ level: random() < 0.5 ? 2 : 3 })
      break
    case 'list':
      editor.commands.toggleBulletList()
      break
    case 'sink':
      editor.commands.sinkListItem('listItem')
      break
    case 'lift':
      editor.commands.liftListItem('listItem')
      break
    case 'bold':
      select(at, at + 6)
      editor.commands.toggleBold()
      break
    case 'paste':
      editor.commands.insertContent([
        { type: 'paragraph', content: [{ type: 'text', text: `${word} pasted block` }] },
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: word }] }] }],
        },
      ])
      break
    case 'delete':
      select(at, at + 25)
      editor.commands.deleteSelection()
      break
  }
}

interface Row {
  readonly step: number
  readonly structural: number
  readonly entries: number
  readonly mapBytes: number
  readonly totalBytes: number
  readonly clientIds: number
  readonly readMs: number
}

/** The size of the map is the Yjs update of a document that holds only a copy of it: what its entries cost in a state. */
function measure(doc: InstanceType<typeof Y.Doc>, step: number, structuralOperations: number): Row {
  const map = doc.getMap(MAP_NAME)
  const alone = new Y.Doc()
  const copy = alone.getMap(MAP_NAME)
  alone.transact(() => {
    for (const [key, value] of map.entries()) copy.set(key, structuredClone(value))
  })
  const state = Y.encodeStateAsUpdate(doc)
  const started = performance.now()
  for (let repeat = 0; repeat < 5; repeat += 1) yUpdateToJson(state)
  return {
    step,
    structural: structuralOperations,
    entries: map.size,
    mapBytes: Y.encodeStateAsUpdate(alone).byteLength,
    totalBytes: state.byteLength,
    clientIds: Y.decodeStateVector(Y.encodeStateVector(doc)).size,
    readMs: (performance.now() - started) / 5,
  }
}

const pad = (value: number, width: number) => String(value).padStart(width)

function print(unit: string, { step, structural: edits, entries, mapBytes, totalBytes, clientIds, readMs }: Row): void {
  const share = ((100 * mapBytes) / totalBytes).toFixed(1)
  const perEntry = entries === 0 ? 0 : Math.round(mapBytes / entries)
  console.log(
    `  ${unit}=${pad(step, 5)} structural=${pad(edits, 4)} entries=${pad(entries, 4)} map=${pad(mapBytes, 8)}B total=${pad(totalBytes, 8)}B share=${share}% clientIds=${clientIds} perEntry=${perEntry}B read=${readMs.toFixed(0)}ms`,
  )
}

function converged(clients: readonly Client[]): boolean {
  const vectors = clients.map(({ doc }) => Buffer.from(Y.encodeStateVector(doc)).toString('hex'))
  const nothingPending = clients.every(({ doc }) => Reflect.get(doc.store, 'pendingStructs') === null)
  return nothingPending && vectors.every((vector) => vector === vectors[0])
}

/** Several clients at once, all of them from the same first state. */
function together(
  label: string,
  mixName: string,
  clientCount: number,
  operations: number,
  marks: readonly number[],
): void {
  const random = seededRandom(SEED)
  const mix = mixes[mixName] ?? []
  const clients: Client[] = []
  const first = openingDocument()
  for (let index = 0; index < clientCount; index += 1) {
    clients.push(openClient(clients, index === 0 ? first : Y.encodeStateAsUpdate((clients[0] as Client).doc)))
  }
  const rows: Row[] = []
  let structuralOperations = 0
  for (let step = 1; step <= operations; step += 1) {
    const client = clients[Math.floor(random() * clients.length)] as Client
    const operation = pick(mix, random)
    perform(client, operation, random)
    if (structural.has(operation)) structuralOperations += 1
    if (marks.includes(step)) rows.push(measure((clients[0] as Client).doc, step, structuralOperations))
  }
  console.log(`${label} [${mixName}, ${clientCount} client(s)] converged=${converged(clients)}`)
  for (const row of rows) print('ops', row)
  for (const { editor } of clients) editor.destroy()
}

/** One client at a time, each session a new `Y.Doc`, so a new client id: what a reload or a reconnection does. */
function sessions(label: string, count: number, operationsEach: number, marks: readonly number[]): void {
  const random = seededRandom(SESSIONS_SEED)
  const mix = mixes['realistic mix'] ?? []
  let state = openingDocument()
  let structuralOperations = 0
  console.log(`${label} [realistic mix, ${count} sessions of ${operationsEach} operations, one client at a time]`)
  for (let session = 1; session <= count; session += 1) {
    const client = openClient([], state)
    for (let step = 0; step < operationsEach; step += 1) {
      const operation = pick(mix, random)
      perform(client, operation, random)
      if (structural.has(operation)) structuralOperations += 1
    }
    state = Y.encodeStateAsUpdate(client.doc)
    if (marks.includes(session)) print('sessions', measure(client.doc, session, structuralOperations))
    client.editor.destroy()
  }
}

const scenarios: Readonly<Record<string, () => void>> = {
  A: () => together('A', 'typing only', 3, 1000, [250, 500, 1000]),
  B: () => together('B', 'realistic mix', 1, 1000, [250, 500, 1000]),
  C: () => together('C', 'realistic mix', 3, 1000, [250, 500, 1000]),
  D: () => together('D', 'realistic mix', 5, 1000, [250, 500, 1000]),
  E: () => together('E', 'structural only', 3, 1000, [250, 500, 1000]),
  F: () => sessions('F', 30, 100, [5, 10, 20, 30]),
  G: () => together('G', 'prose-heavy mix', 3, 2000, [500, 1000, 2000]),
}

const only = process.argv[2]
for (const [label, run] of Object.entries(scenarios)) if (only === undefined || only === label) run()
// The editors keep timers and observers alive: the process leaves when the measurement is done.
process.exit(0)
