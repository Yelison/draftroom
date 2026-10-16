import { restAs, type DemoPerson } from './people.ts'

/**
 * A document made for one test, so that no test reads what another wrote: created by `owner` in their workspace, with
 * each of the others an editor of it. A new document is private, so whoever is not named here cannot open it.
 */
export async function createDocument(owner: DemoPerson, editors: readonly DemoPerson[]): Promise<string> {
  const ownerRest = restAs(owner)
  const [workspace] = (await ownerRest.listWorkspaces()).items
  if (workspace === undefined) throw new Error(`${owner} belongs to no workspace: was the demo seed run?`)
  const { id: documentId } = await ownerRest.createDocument({
    params: { path: { workspaceId: workspace.id } },
    body: { title: `Convergence ${crypto.randomUUID()}` },
  })
  for (const editor of editors) await grantEditor(owner, documentId, editor)
  return documentId
}

export async function grantEditor(owner: DemoPerson, documentId: string, editor: DemoPerson): Promise<void> {
  const { id: userId } = await restAs(editor).getMe()
  await restAs(owner).setAccess({ params: { path: { documentId, userId } }, body: { role: 'editor' } })
}

export async function revokeAccess(owner: DemoPerson, documentId: string, person: DemoPerson): Promise<void> {
  const { id: userId } = await restAs(person).getMe()
  await restAs(owner).removeAccess({ params: { path: { documentId, userId } } })
}
