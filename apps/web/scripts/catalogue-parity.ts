// The parity of the message catalogues: the Spanish one has exactly the keys of the English one, every message is valid
// ICU, and a translation reads the same arguments as its source (a lost `{language}` would print a blank in the page).
// ICU is validated, and the arguments read, by the FormatJS CLI that the build already uses.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileMessages, type MessageNode } from './formatjs.ts'

export interface Catalogue {
  /** The file name, for the report. */
  file: string
  /** The messages by id, as read from the file: a value that is not a string is reported, not trusted. */
  messages: Readonly<Record<string, unknown>>
}

// The node types that name an argument the caller has to provide: 1 to 6, and 8 for a rich-text tag.
const namesAnArgument = (node: MessageNode) => (node.type >= 1 && node.type <= 6) || node.type === 8

/** Every argument a message reads, including the ones inside the branches of a plural or a select and in tags. */
function argumentNames(nodes: readonly MessageNode[], names = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (namesAnArgument(node) && node.value !== undefined) names.add(node.value)
    for (const option of Object.values(node.options ?? {})) argumentNames(option.value, names)
    argumentNames(node.children ?? [], names)
  }
  return names
}

/** The syntax tree of each message that is valid ICU. A message the CLI could not parse is left out. */
function compile(messages: Record<string, string>): Record<string, readonly MessageNode[]> {
  const directory = mkdtempSync(join(tmpdir(), 'catalogue-parity-'))
  try {
    const input = join(directory, 'messages.json')
    writeFileSync(input, JSON.stringify(messages))
    // skipErrors keeps going past an invalid message instead of failing the whole file, so the report names each one.
    return compileMessages(input, { skipErrors: true })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** The arguments of each valid message of a catalogue, and a problem for each message that is not valid ICU. */
function parseCatalogue({ file, messages }: Catalogue) {
  const strings: Record<string, string> = {}
  const problems: string[] = []
  for (const [id, message] of Object.entries(messages)) {
    if (typeof message === 'string') strings[id] = message
    else problems.push(`${file}: "${id}" is not a string`)
  }

  const compiled = compile(strings)
  const argumentsById = new Map<string, Set<string>>()
  for (const id of Object.keys(strings)) {
    const nodes = compiled[id]
    if (nodes === undefined) problems.push(`${file}: "${id}" is not valid ICU`)
    else argumentsById.set(id, argumentNames(nodes))
  }
  return { argumentsById, problems }
}

/** The problems of a translation against its source: an empty list when the two catalogues agree. */
export function catalogueProblems(source: Catalogue, translation: Catalogue): string[] {
  const parsedSource = parseCatalogue(source)
  const parsedTranslation = parseCatalogue(translation)
  const problems = [...parsedSource.problems, ...parsedTranslation.problems]

  for (const id of Object.keys(source.messages)) {
    if (!Object.hasOwn(translation.messages, id)) problems.push(`${translation.file}: missing "${id}"`)
  }
  for (const id of Object.keys(translation.messages)) {
    if (!Object.hasOwn(source.messages, id)) problems.push(`${translation.file}: "${id}" is not in ${source.file}`)
  }

  for (const [id, expected] of parsedSource.argumentsById) {
    const actual = parsedTranslation.argumentsById.get(id)
    if (actual === undefined) continue
    const list = (names: Set<string>) => [...names].sort().join(', ') || 'none'
    if (list(expected) !== list(actual)) {
      problems.push(`${translation.file}: "${id}" uses ${list(actual)}, but ${source.file} uses ${list(expected)}`)
    }
  }
  return problems
}
