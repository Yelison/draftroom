import { describe, expect, it } from 'vitest'
import { isApiError } from '../errors.ts'
import { createMockDataSource, createMockServer } from './createMockDataSource.ts'
import { ana, daniel, demoPassword, harborPine, lanternStudio, marta } from './fixtures/index.ts'
import { weeklyEnglish, weeklySpanish } from './fixtures/documents.ts'

const workspace = { params: { path: { workspaceId: harborPine.id } } }

async function refusal(call: Promise<unknown>) {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  if (!isApiError(error)) throw new Error('Expected the call to be refused', { cause: error })
  return error
}

describe('MockDataSource state', () => {
  it('starts every instance from the fixtures, whatever another one changed', async () => {
    const first = createMockServer().connect({ signedInAs: marta.email })
    const second = createMockServer().connect({ signedInAs: marta.email })

    await first.createFolder({ ...workspace, body: { name: 'Only here' } })

    const names = (await second.listFolders(workspace)).items.map((folder) => folder.name)
    expect(names).not.toContain('Only here')
  })

  it('shares one world between the connections of a server, each with its own session', async () => {
    const server = createMockServer()
    const owner = server.connect({ signedInAs: marta.email })
    const member = server.connect({ signedInAs: daniel.email })
    const anonymous = server.connect()

    await owner.createFolder({ ...workspace, body: { name: 'Shared news' } })

    const seen = (await member.listFolders(workspace)).items.map((folder) => folder.name)
    expect(seen).toContain('Shared news')
    await expect(owner.getMe()).resolves.toMatchObject({ email: marta.email })
    await expect(member.getMe()).resolves.toMatchObject({ email: daniel.email })
    expect((await refusal(anonymous.getMe())).code).toBe('unauthenticated')
  })

  it('opens the demo signed in as its first person', async () => {
    await expect(createMockDataSource().getMe()).resolves.toMatchObject({ email: marta.email, name: 'Marta Ruiz' })
  })

  it('lists the workspaces of a person by name, and only theirs', async () => {
    const server = createMockServer()

    const danielsWorkspaces = await server.connect({ signedInAs: daniel.email }).listWorkspaces()
    const martasWorkspaces = await server.connect({ signedInAs: marta.email }).listWorkspaces()

    expect(danielsWorkspaces.items.map((row) => [row.name, row.role])).toEqual([
      [harborPine.name, 'member'],
      [lanternStudio.name, 'member'],
    ])
    expect(martasWorkspaces.items.map((row) => row.name)).toEqual([harborPine.name])
  })
})

describe('MockDataSource ordering', () => {
  it('keeps two documents with the same instant in the order of their ids, page after page', async () => {
    expect(weeklyEnglish.updatedAt).toBe(weeklySpanish.updatedAt)
    const api = createMockDataSource()
    const [later, earlier] = [weeklyEnglish.id, weeklySpanish.id].sort().reverse()

    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await api.listDocuments({
        params: {
          path: { workspaceId: harborPine.id },
          query: { limit: 1, ...(cursor === undefined ? {} : { cursor }) },
        },
      })
      seen.push(...page.items.map((row) => row.id))
      cursor = page.nextCursor ?? undefined
    } while (cursor !== undefined)

    expect(seen.indexOf(later ?? '')).toBeLessThan(seen.indexOf(earlier ?? ''))
    expect(seen).toHaveLength(10)
  })

  it('puts what happened last first in the history', async () => {
    const api = createMockDataSource()
    await api.createFolder({ ...workspace, body: { name: 'Marker' } })
    const created = await api.createDocument({ ...workspace, body: { title: 'Latest' } })

    const { items } = await api.listWorkspaceActivity(workspace)

    expect(items[0]).toMatchObject({ type: 'document.created', document: { id: created.id } })
  })
})

describe('MockDataSource accounts', () => {
  it('answers a wrong password and an unknown email in the same way', async () => {
    const api = createMockServer().connect()

    const wrongPassword = await refusal(api.signIn({ body: { email: marta.email, password: 'not the password' } }))
    const unknownEmail = await refusal(api.signIn({ body: { email: 'nobody@example.test', password: demoPassword } }))

    expect(wrongPassword.problem).toEqual(unknownEmail.problem)
    expect(wrongPassword.code).toBe('unauthenticated')
  })

  it('signs in and out', async () => {
    const api = createMockServer().connect()

    await api.signIn({ body: { email: daniel.email, password: demoPassword } })
    await expect(api.getMe()).resolves.toMatchObject({ email: daniel.email })
    await api.signOut()

    expect((await refusal(api.getMe())).code).toBe('unauthenticated')
  })

  it('lets someone invited by email claim their place by signing up, with the same userId', async () => {
    const server = createMockServer()
    const owner = server.connect({ signedInAs: marta.email })
    const pending = (await owner.listMembers(workspace)).items.find((member) => member.userId === ana.id)
    expect(pending).toMatchObject({ status: 'pending', name: null })

    const signedUp = await server
      .connect()
      .signUp({ body: { email: ana.email, password: demoPassword, name: 'Ana Beltrán' } })

    const claimed = (await owner.listMembers(workspace)).items.find((member) => member.userId === ana.id)
    expect(signedUp.id).toBe(ana.id)
    expect(claimed).toMatchObject({ status: 'active', name: 'Ana Beltrán' })
  })

  it('refuses to sign up an email that already has an account', async () => {
    const api = createMockServer().connect()

    const error = await refusal(api.signUp({ body: { email: marta.email, password: demoPassword, name: 'Someone' } }))

    expect(error.code).toBe('conflict')
  })

  it('asks for a password of at least 12 characters', async () => {
    const api = createMockServer().connect()

    const error = await refusal(
      api.signUp({ body: { email: 'new@harborpine.example', password: 'short', name: 'New' } }),
    )

    expect(error).toMatchObject({ status: 400, fieldErrors: [{ pointer: '/password', code: 'too-short' }] })
  })
})
