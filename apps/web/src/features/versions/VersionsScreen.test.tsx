import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { launchPlan, openVersions, renderScreen, sofia, versionsPath, daniel } from './testing/openVersions.tsx'

describe('the header of the history', () => {
  it('names the history and, under it, the document', async () => {
    await openVersions()

    const headline = screen.getByRole('heading', { level: 1, name: 'Version history' })
    expect(headline.nextElementSibling).toHaveTextContent('Autumn launch plan')
  })

  it.each([
    { role: 'an owner', email: undefined, saves: true },
    { role: 'an editor', email: daniel.email, saves: true },
    { role: 'a commenter', email: sofia, saves: false },
  ])('offers to save a version to $role: $saves', async ({ email, saves }) => {
    await openVersions(launchPlan.id, email === undefined ? {} : { signedInAs: email })

    expect(screen.queryByRole('button', { name: 'Save a version' }) !== null).toBe(saves)
  })
})

describe('the way in and out of the history', () => {
  it('is a button of the editor, and the document is one link away', async () => {
    const view = renderScreen(`/documents/${launchPlan.id}`)

    await view.user.click(await screen.findByRole('button', { name: 'Version history' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Version history' })).toBeInTheDocument()
    expect(view.router.state.location.pathname).toBe(versionsPath(launchPlan.id))

    await view.user.click(screen.getByRole('link', { name: 'Back to the document “Autumn launch plan”' }))
    expect(await screen.findByRole('textbox', { name: 'Document title' })).toBeInTheDocument()
  })

  it('says "Back to the document" and names the title only in the accessible name, which contains the visible words', async () => {
    await openVersions()

    const back = screen.getByRole('link', { name: /^Back to the document/ })
    expect(back).toHaveTextContent(/^Back to the document$/)
    expect(back).toHaveAccessibleName('Back to the document “Autumn launch plan”')
  })

  it('is open to a person who can only read the document', async () => {
    renderScreen(versionsPath(launchPlan.id), { signedInAs: sofia })

    expect(await screen.findByText(/The launch moves to the second week of November/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to/ })).toBeInTheDocument()
  })

  it('says that the document is not there when it is not, and lists no versions', async () => {
    renderScreen(versionsPath('00000000-0000-4000-8000-00000000dead'))

    expect(await screen.findByRole('alert')).toHaveTextContent("This document isn't available")
    expect(screen.queryByRole('region', { name: 'Versions' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Documents' })).toBeInTheDocument()
  })
})
