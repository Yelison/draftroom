import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { daniel, sofia } from '../../data/mock/fixtures/index.ts'
import { fixtures, renderScreen } from './testing/renderScreen.tsx'

const { launchPlan, weeklyEnglish, budget, designReview } = fixtures
const main = () => screen.getByRole('main')
const rowOf = async (title: string) => {
  const row = (await within(main()).findByRole('link', { name: title })).closest('li')
  if (row === null) throw new Error(`The link "${title}" is not in a row`)
  return row
}

describe('a row of the Documents screen', () => {
  it('says who made the document and when it changed, with the date in a time element', async () => {
    renderScreen('/documents')

    const row = await rowOf(weeklyEnglish.title)

    expect(within(row).getByText('Created by')).toBeInTheDocument()
    expect(within(row).getByText('Sofía Lindqvist')).toBeInTheDocument()
    expect(within(row).getByText('Updated')).toBeInTheDocument()
    expect(row.querySelector('time')).toHaveAttribute('datetime', weeklyEnglish.updatedAt)
  })

  it('shows the start of the text, and says there is none for a document that is empty', async () => {
    renderScreen('/documents', {
      wrap: (dataSource) => ({
        ...dataSource,
        listDocuments: async (request) => {
          const page = await dataSource.listDocuments(request)
          return {
            ...page,
            items: page.items.map((item) => (item.id === weeklyEnglish.id ? { ...item, excerpt: null } : item)),
          }
        },
      }),
    })

    expect(within(await rowOf(weeklyEnglish.title)).getByText('No text yet')).toBeInTheDocument()
    expect(within(await rowOf(designReview.title)).getByText(/Acordamos simplificar/)).toBeInTheDocument()
  })

  it.each([
    { who: 'the owner', signedInAs: undefined, title: launchPlan.title, badge: null },
    { who: 'an editor', signedInAs: daniel.email, title: launchPlan.title, badge: 'Editor' },
    { who: 'a commenter', signedInAs: sofia.email, title: launchPlan.title, badge: 'Commenter' },
    { who: 'a viewer', signedInAs: daniel.email, title: budget.title, badge: 'Viewer' },
  ])('names the role of $who only when it is not ownership', async ({ signedInAs, title, badge }) => {
    renderScreen('/documents', signedInAs === undefined ? {} : { signedInAs })

    const row = await rowOf(title)

    const roles = ['Editor', 'Commenter', 'Viewer', 'Owner']
    expect(roles.filter((role) => within(row).queryByText(role) !== null)).toEqual(badge === null ? [] : [badge])
  })

  it.each([
    { role: 'an owner', signedInAs: undefined, title: launchPlan.title, items: ['Rename or move', 'Archive'] },
    { role: 'an editor', signedInAs: daniel.email, title: launchPlan.title, items: ['Rename or move'] },
    { role: 'a commenter', signedInAs: sofia.email, title: launchPlan.title, items: null },
    { role: 'a viewer', signedInAs: daniel.email, title: budget.title, items: null },
  ])('offers $role the menu with $items', async ({ signedInAs, title, items }) => {
    const { user } = renderScreen('/documents', signedInAs === undefined ? {} : { signedInAs })
    const row = await rowOf(title)
    const actions = within(row).queryByRole('button', { name: `Actions for ${title}` })

    if (items === null) {
      expect(actions).not.toBeInTheDocument()
      return
    }
    await user.click(actions ?? row)

    expect(
      within(await screen.findByRole('menu'))
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(items)
  })

  it('has the pin for every role, since a pin is personal', async () => {
    renderScreen('/documents', { signedInAs: daniel.email })

    const row = await rowOf(budget.title)

    expect(within(row).getByRole('button', { name: `Pin ${budget.title}` })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reaches the pin and the menu with the keyboard, after the title', async () => {
    const { user } = renderScreen('/documents')
    const row = await rowOf(weeklyEnglish.title)

    within(row).getByRole('link', { name: weeklyEnglish.title }).focus()
    await user.tab()
    expect(within(row).getByRole('button', { name: `Pin ${weeklyEnglish.title}` })).toHaveFocus()
    await user.tab()

    expect(within(row).getByRole('button', { name: `Actions for ${weeklyEnglish.title}` })).toHaveFocus()
  })
})
