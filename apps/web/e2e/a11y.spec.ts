/* Accessibility with axe on every route of the list, in each theme, language and width of the matrix. */
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures.ts'
import { matrix, routes } from './routes.ts'

/**
 * A violation that is understood and accepted, one by one: the route, the rule and the element, and why it is not fixed.
 * There is no rule switched off for the whole suite. An entry that no longer matches anything fails the test, so the list
 * cannot go on saying something the app stopped doing.
 */
interface KnownViolation {
  route: string
  rule: string
  selector: string
  reason: string
}

const knownViolations: readonly KnownViolation[] = []

const blocking = new Set(['serious', 'critical'])

for (const locale of matrix.locales) {
  for (const colorScheme of matrix.themes) {
    for (const width of matrix.widths) {
      test.describe(`${locale}, ${colorScheme} theme, ${width} px`, () => {
        test.use({ locale, colorScheme, viewport: { width, height: 900 } })

        for (const route of routes) {
          test(`${route.name} has no serious or critical violation`, async ({ page }, testInfo) => {
            await route.open(page)

            const { violations } = await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
              .analyze()

            // Lesser findings are not failures, but they are not lost: they are on the report of the test.
            for (const { id, impact, nodes } of violations.filter(({ impact }) => !blocking.has(impact ?? ''))) {
              testInfo.annotations.push({
                type: `${impact ?? 'unknown'}: ${id}`,
                description: nodes.map(({ target }) => target.join(' ')).join('; '),
              })
            }

            const accepted = knownViolations.filter((known) => known.route === route.name)
            const found = violations
              .filter(({ impact }) => blocking.has(impact ?? ''))
              .flatMap(({ id, impact, help, nodes }) =>
                nodes.map((node) => ({ id, impact, help, selector: node.target.join(' '), html: node.html })),
              )
            const unexplained = found.filter(
              ({ id, selector }) => !accepted.some((known) => known.rule === id && known.selector === selector),
            )
            const stale = accepted.filter(
              ({ rule, selector }) =>
                !found.some((violation) => violation.id === rule && violation.selector === selector),
            )

            expect(unexplained, 'violations of axe that are not accepted').toEqual([])
            expect(stale, 'accepted violations that axe no longer finds').toEqual([])
          })
        }
      })
    }
  }
}

// What moves is what a person with a vestibular disorder is protected from: an animation, or a transition of the position or
// the size of something. A change of colour on hover is not movement, and stays.
const movingProperty = /^(all|transform|translate|scale|rotate|margin|padding|inset|top|left|right|bottom|width|height)/

test.describe('with reduced motion', () => {
  test.use({ locale: 'en-US', colorScheme: 'light', reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } })

  for (const route of routes) {
    test(`${route.name} animates nothing that moves`, async ({ page }) => {
      await route.open(page)

      const moving = await page.evaluate((pattern) => {
        const movement = new RegExp(pattern)
        const seconds = (value: string) => value.split(',').map((part) => Number.parseFloat(part))
        const found: string[] = []
        for (const element of document.querySelectorAll('*')) {
          for (const pseudo of [null, '::before', '::after']) {
            const style = getComputedStyle(element, pseudo)
            const animated = style.animationName.split(',').some((name, index) => {
              const duration = seconds(style.animationDuration)[index % seconds(style.animationDuration).length] ?? 0
              return name.trim() !== 'none' && duration > 0
            })
            const moves = style.transitionProperty.split(',').some((property, index) => {
              const duration = seconds(style.transitionDuration)[index % seconds(style.transitionDuration).length] ?? 0
              return movement.test(property.trim()) && duration > 0
            })
            if (animated || moves)
              found.push(`${element.tagName.toLowerCase()}${pseudo ?? ''} .${String(element.className).split(' ')[0]}`)
          }
        }
        // Scrolling that glides is movement too.
        if (getComputedStyle(document.documentElement).scrollBehavior === 'smooth')
          found.push('the page scrolls smoothly')
        return found
      }, movingProperty.source)

      expect(moving).toEqual([])
    })
  }
})

test.describe('the markup', () => {
  test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 900 } })

  for (const route of routes) {
    // A class that a stylesheet does not define is read as `undefined` by the template that builds the list of classes.
    test(`${route.name} has no class named after a value that is missing`, async ({ page }) => {
      await route.open(page)

      const named = await page.evaluate(() =>
        [...document.querySelectorAll('[class]')]
          .filter((element) => /(^|\s)(undefined|null|false)(\s|$)/.test(element.getAttribute('class') ?? ''))
          .map((element) => `${element.tagName.toLowerCase()}.${element.getAttribute('class')}`),
      )

      expect(named).toEqual([])
    })
  }
})
