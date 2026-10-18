import type { Schema } from '@draftroom/contract'
import { environment } from '../../apps/web/e2e-collab/environment.ts'
import { almazara, demoPassword, harborAndPine, people } from '../../apps/server/src/db/demo-seed/content.ts'

// The cast of the tour: accounts of the demo seed, whose documents the seed makes. Nothing here is personal data. Each
// workspace has a person who belongs to it alone: the app works in the first workspace of whoever signs in (by name), so
// Marta, who is in both, would see the Spanish one first.

export interface Account {
  readonly email: string
  readonly name: string
}

export interface Workspace {
  readonly name: string
  readonly language: 'en' | 'es'
  /** The document the tour opens, as the seed names it. */
  readonly documentTitle: string
  readonly owner: Account
  readonly colleague: Account
}

export const english: Workspace = {
  name: harborAndPine.name,
  language: 'en',
  documentTitle: 'Meeting notes, 4 November',
  owner: people.daniel,
  colleague: people.priya,
}

export const spanish: Workspace = {
  name: almazara.name,
  language: 'es',
  documentTitle: 'Plan de la cosecha de otoño',
  owner: people.lucia,
  colleague: people.mateo,
}

export { demoPassword }

/**
 * One call to the API as an account, from Node, where there is no browser to hold a session: the server of the stack runs
 * in `test` mode, which takes the development identity header (docs/decisions/0010-server-authorisation.md).
 */
async function call<Body>(account: Account, method: 'GET' | 'PUT', path: string, body?: unknown): Promise<Body> {
  const response = await fetch(`${environment.apiOrigin}/api${path}`, {
    method,
    headers: { 'x-dev-user': account.email, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok)
    throw new Error(`${method} ${path} as ${account.name} answered ${response.status}: was the demo seed run?`)
  return (await response.json()) as Body
}

/** The id of the workspace's document with this title, read from the API as its owner. */
export async function documentIdOf(workspace: Workspace): Promise<string> {
  const workspaces = await call<{ items: Schema<'Workspace'>[] }>(workspace.owner, 'GET', '/workspaces')
  const found = workspaces.items.find(({ name }) => name === workspace.name)
  if (found === undefined)
    throw new Error(`${workspace.owner.name} is not in ${workspace.name}: was the demo seed run?`)
  const query = new URLSearchParams({ query: workspace.documentTitle })
  const documents = await call<{ items: Schema<'Document'>[] }>(
    workspace.owner,
    'GET',
    `/workspaces/${found.id}/documents?${query}`,
  )
  const document = documents.items.find(({ title }) => title === workspace.documentTitle)
  if (document === undefined)
    throw new Error(`"${workspace.documentTitle}" is not in ${workspace.name}: did the seed change?`)
  return document.id
}

/** The colleague writes in the document: the seed gives them less than an editor in the English workspace, and the tour needs two writers. */
export async function makeColleagueEditor(workspace: Workspace, documentId: string): Promise<void> {
  const { id: userId } = await call<{ id: string }>(workspace.colleague, 'GET', '/me')
  await call(workspace.owner, 'PUT', `/documents/${documentId}/access/${userId}`, { role: 'editor' })
}
